"""Shared LLM-as-judge infrastructure: single and batch judging."""
import asyncio
import json
import logging
import re

from anthropic import AsyncAnthropic

from beacon.config import EVAL_MODEL, EVAL_TIMEOUT

logger = logging.getLogger(__name__)

# Higher than EVAL_MAX_TOKENS (512) because judge responses with arrays
# (e.g. groundedness claims) can be longer than single evaluations.
JUDGE_MAX_TOKENS = 1024


def _extract_json_object(text: str) -> dict:
    """Robustly extract a JSON object from text that may be truncated or wrapped in prose."""
    text = text.strip()

    # Strip markdown code fences
    text = re.sub(r"^\s*```[a-zA-Z]*\s*\r?\n?", "", text)
    text = re.sub(r"\r?\n?\s*```\s*$", "", text)
    text = text.strip()

    # Try direct parse
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass

    # Find the outermost { and try progressively shorter substrings ending at }
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", text, 0)

    candidate = text[start:]
    # Try each } from the last one backwards
    close_positions = [m.end() for m in re.finditer(r"}", candidate)]
    for end in reversed(close_positions):
        try:
            result = json.loads(candidate[:end])
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            continue

    # Last resort: truncate to last complete item then close structures.
    # Find the last comma before truncation and cut there, then close brackets.
    # e.g. '{"claims": [{"a":1}, {"b": trunc' -> '{"claims": [{"a":1}]}'
    comma_positions = [m.start() for m in re.finditer(r",\s*\{", candidate)]
    for pos in reversed(comma_positions):
        truncated = candidate[:pos]
        open_brackets = truncated.count("[") - truncated.count("]")
        open_braces = truncated.count("{") - truncated.count("}")
        repaired = truncated + "]" * open_brackets + "}" * open_braces
        try:
            result = json.loads(repaired)
            if isinstance(result, dict):
                logger.warning("Recovered truncated JSON by trimming incomplete item")
                return result
        except json.JSONDecodeError:
            continue

    # Final attempt: close open strings/structures naively
    repaired = candidate.rstrip()
    if repaired.count('"') % 2 == 1:
        repaired += '"'
    open_brackets = repaired.count("[") - repaired.count("]")
    repaired += "]" * open_brackets
    open_braces = repaired.count("{") - repaired.count("}")
    repaired += "}" * open_braces
    try:
        result = json.loads(repaired)
        if isinstance(result, dict):
            logger.warning("Recovered truncated JSON response")
            return result
    except json.JSONDecodeError:
        pass

    raise json.JSONDecodeError("Could not extract valid JSON object", text, 0)


async def judge(prompt: str, client: AsyncAnthropic, max_attempts: int = 3) -> dict:
    """Single Claude judge call. Parses JSON response, retries on failure."""
    for attempt in range(max_attempts):
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=EVAL_MODEL,
                    max_tokens=JUDGE_MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=EVAL_TIMEOUT,
            )
            text = response.content[0].text
            return _extract_json_object(text)

        except Exception:
            if attempt < max_attempts - 1:
                logger.warning("Judge call failed (attempt %d), retrying...", attempt + 1)
                continue
            logger.error("Judge call failed after %d attempts", max_attempts)
            raise

    return {}  # unreachable but satisfies type checker


async def judge_batch(
    prompts: list[str],
    client: AsyncAnthropic,
    semaphore_limit: int = 5,
) -> list[dict]:
    """Parallel judge calls with semaphore concurrency control."""
    semaphore = asyncio.Semaphore(semaphore_limit)

    async def _guarded(prompt: str) -> dict:
        async with semaphore:
            return await judge(prompt, client)

    return list(await asyncio.gather(*[_guarded(p) for p in prompts]))
