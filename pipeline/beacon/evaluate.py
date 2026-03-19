"""Beacon evaluate module: Claude-based source evaluation."""
import asyncio
import json

from anthropic import AsyncAnthropic

from beacon.config import (
    EVAL_MAX_TOKENS,
    EVAL_MODEL,
    EVAL_SEMAPHORE_LIMIT,
    EVAL_TIMEOUT,
    get_config,
)
from beacon.models import EvaluatedSource, IntelligenceSignals, Source
from beacon.prompts import build_evaluate_prompt


def _failed_signals() -> IntelligenceSignals:
    """Return default signals for a failed evaluation."""
    return IntelligenceSignals(
        learning_efficiency_score=0,
        content_type="other",
        time_estimate_minutes=0,
        recency=None,
        key_insight="Evaluation failed",
        coverage=[],
        evaluation_failed=True,
    )


async def _call_claude(client: AsyncAnthropic, prompt: str) -> str:
    """Call Claude and return the response text, with timeout."""
    response = await asyncio.wait_for(
        client.messages.create(
            model=EVAL_MODEL,
            max_tokens=EVAL_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=EVAL_TIMEOUT,
    )
    return response.content[0].text


def _parse_signals(text: str) -> IntelligenceSignals:
    """Parse JSON text into IntelligenceSignals."""
    parsed = json.loads(text)
    return IntelligenceSignals(**parsed)


async def evaluate_source(
    source: Source,
    topic: str,
    client: AsyncAnthropic | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> EvaluatedSource:
    """Evaluate a single source's learning efficiency using Claude.

    On failure (malformed JSON, timeout, API error): retries once, then assigns
    default failed signals with score=0 and evaluation_failed=True.
    """
    if client is None:
        cfg = get_config()
        client = AsyncAnthropic(api_key=cfg.anthropic_api_key)

    prompt = build_evaluate_prompt(
        topic=topic, url=source.url, title=source.title, snippet=source.snippet
    )

    async def _attempt() -> IntelligenceSignals:
        text = await _call_claude(client, prompt)
        return _parse_signals(text)

    async def _run():
        # Try up to 2 times (initial + 1 retry)
        for attempt in range(2):
            try:
                return await _attempt()
            except Exception:
                if attempt == 0:
                    continue
                return _failed_signals()
        return _failed_signals()

    if semaphore is not None:
        async with semaphore:
            signals = await _run()
    else:
        signals = await _run()

    return EvaluatedSource(
        url=source.url,
        title=source.title,
        snippet=source.snippet,
        signals=signals,
    )


async def evaluate_sources(
    sources: list[Source],
    topic: str,
    client: AsyncAnthropic | None = None,
    queue: asyncio.Queue | None = None,
) -> list[EvaluatedSource]:
    """Evaluate all sources in parallel and return sorted results.

    Uses asyncio.Semaphore to limit concurrent Claude API calls.
    Results are sorted by learning_efficiency_score descending.
    """
    if client is None:
        cfg = get_config()
        client = AsyncAnthropic(api_key=cfg.anthropic_api_key)

    semaphore = asyncio.Semaphore(EVAL_SEMAPHORE_LIMIT)

    async def _eval_with_semaphore(source: Source) -> EvaluatedSource:
        result = await evaluate_source(
            source, topic, client=client, semaphore=semaphore
        )
        if queue is not None:
            await queue.put(result)
        return result

    results = await asyncio.gather(*[_eval_with_semaphore(s) for s in sources])
    results_list = list(results)
    results_list.sort(
        key=lambda r: r.signals.learning_efficiency_score, reverse=True
    )
    return results_list
