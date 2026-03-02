# Section 04 -- Evaluate: Claude-Based Source Evaluation

## Overview

This section implements the evaluation module (`beacon/evaluate.py`) that takes a list of `Source` objects and a research topic, sends one Claude API call per source (in parallel with a semaphore), parses the structured JSON responses into `IntelligenceSignals`, and returns a sorted list of `EvaluatedSource` objects. It also supports a producer-consumer pattern via `asyncio.Queue` for real-time progress reporting.

After completing this section you will have:

- `beacon/evaluate.py` with `evaluate_source()` and `evaluate_sources()` async functions
- `tests/test_evaluate.py` with full test coverage using mocked Claude responses
- Parallel evaluation with semaphore, timeout handling, retry logic, and graceful failure defaults

## Dependencies

- **Section 01 (Foundation)**: `config.py` constants (`EVAL_SEMAPHORE_LIMIT`, `EVAL_MODEL`, `EVAL_TIMEOUT`, `EVAL_MAX_TOKENS`), `conftest.py` fixtures
- **Section 02 (Models)**: `Source`, `IntelligenceSignals`, `EvaluatedSource` from `beacon/models.py`; `build_evaluate_prompt` from `beacon/prompts.py`

## Files to Create

```
beacon/
  evaluate.py         # Claude-based source evaluation
tests/
  test_evaluate.py    # Tests for evaluate.py
```

---

## Tests FIRST: `tests/test_evaluate.py`

```python
"""Tests for beacon.evaluate -- write these FIRST."""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from beacon.models import Source, IntelligenceSignals, EvaluatedSource


def _make_claude_response(signals_dict: dict) -> MagicMock:
    """Helper: create a mock Claude API response with the given JSON body."""
    response = MagicMock()
    response.content = [MagicMock()]
    response.content[0].text = json.dumps(signals_dict)
    return response


def _valid_signals_dict(**overrides) -> dict:
    """Helper: return a valid IntelligenceSignals dict with optional overrides."""
    base = {
        "learning_efficiency_score": 8,
        "content_type": "tutorial",
        "time_estimate_minutes": 15,
        "recency": "2025",
        "key_insight": "Comprehensive tutorial.",
        "coverage": ["basics", "advanced"],
    }
    base.update(overrides)
    return base


@pytest.fixture
def sample_source():
    return Source(url="https://example.com/tutorial", title="Tutorial", snippet="A great tutorial.")


@pytest.fixture
def mock_client():
    client = AsyncMock()
    client.messages.create = AsyncMock(return_value=_make_claude_response(_valid_signals_dict()))
    return client


class TestEvaluateSource:
    @pytest.mark.asyncio
    async def test_calls_claude_with_correct_model(self, sample_source, mock_client):
        """evaluate_source must use the claude-sonnet-4-6 model."""
        from beacon.evaluate import evaluate_source
        await evaluate_source(sample_source, "test topic", client=mock_client)
        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs["model"] == "claude-sonnet-4-6"

    @pytest.mark.asyncio
    async def test_sets_max_tokens_512(self, sample_source, mock_client):
        """evaluate_source must set max_tokens=512."""
        from beacon.evaluate import evaluate_source
        await evaluate_source(sample_source, "test topic", client=mock_client)
        call_kwargs = mock_client.messages.create.call_args[1]
        assert call_kwargs["max_tokens"] == 512

    @pytest.mark.asyncio
    async def test_prompt_contains_source_data(self, sample_source, mock_client):
        """The prompt must include the source URL, title, snippet, and topic."""
        from beacon.evaluate import evaluate_source
        await evaluate_source(sample_source, "machine learning", client=mock_client)
        call_kwargs = mock_client.messages.create.call_args[1]
        messages = call_kwargs["messages"]
        prompt_text = messages[0]["content"] if isinstance(messages[0]["content"], str) else str(messages)
        # At minimum the topic and source URL should appear somewhere in the call
        full_call_str = str(call_kwargs)
        assert "machine learning" in full_call_str or "test topic" in full_call_str

    @pytest.mark.asyncio
    async def test_parses_json_into_intelligence_signals(self, sample_source, mock_client):
        """evaluate_source must parse the JSON response into an IntelligenceSignals object."""
        from beacon.evaluate import evaluate_source
        result = await evaluate_source(sample_source, "test topic", client=mock_client)
        assert isinstance(result, EvaluatedSource)
        assert isinstance(result.signals, IntelligenceSignals)
        assert result.signals.learning_efficiency_score == 8

    @pytest.mark.asyncio
    async def test_handles_malformed_json_with_defaults(self, sample_source):
        """If Claude returns invalid JSON, after retry, assign default failed signals."""
        client = AsyncMock()
        bad_response = MagicMock()
        bad_response.content = [MagicMock()]
        bad_response.content[0].text = "This is not JSON at all"
        client.messages.create = AsyncMock(return_value=bad_response)

        from beacon.evaluate import evaluate_source
        result = await evaluate_source(sample_source, "test topic", client=client)
        assert result.signals.evaluation_failed is True
        assert result.signals.learning_efficiency_score == 0

    @pytest.mark.asyncio
    async def test_timeout_produces_failed_defaults(self, sample_source):
        """If evaluation times out, assign default failed signals (score=0)."""
        client = AsyncMock()
        client.messages.create = AsyncMock(side_effect=asyncio.TimeoutError)

        from beacon.evaluate import evaluate_source
        result = await evaluate_source(sample_source, "test topic", client=client)
        assert result.signals.evaluation_failed is True
        assert result.signals.learning_efficiency_score == 0


class TestEvaluateSources:
    @pytest.mark.asyncio
    async def test_runs_in_parallel(self):
        """evaluate_sources must use asyncio.gather for parallel execution."""
        client = AsyncMock()
        client.messages.create = AsyncMock(return_value=_make_claude_response(_valid_signals_dict()))

        sources = [
            Source(url=f"https://example.com/{i}", title=f"Source {i}", snippet=f"Snippet {i}")
            for i in range(5)
        ]
        from beacon.evaluate import evaluate_sources
        results = await evaluate_sources(sources, "test topic", client=client)
        assert len(results) == 5
        # All should have been called
        assert client.messages.create.call_count == 5

    @pytest.mark.asyncio
    async def test_respects_semaphore_limit(self):
        """evaluate_sources must limit concurrent calls to 10 (EVAL_SEMAPHORE_LIMIT)."""
        max_concurrent = 0
        current_concurrent = 0
        lock = asyncio.Lock()

        original_create = AsyncMock(return_value=_make_claude_response(_valid_signals_dict()))

        async def tracked_create(**kwargs):
            nonlocal max_concurrent, current_concurrent
            async with lock:
                current_concurrent += 1
                if current_concurrent > max_concurrent:
                    max_concurrent = current_concurrent
            await asyncio.sleep(0.01)
            async with lock:
                current_concurrent -= 1
            return original_create.return_value

        client = AsyncMock()
        client.messages.create = tracked_create

        sources = [
            Source(url=f"https://example.com/{i}", title=f"S{i}", snippet=f"Snip {i}")
            for i in range(15)
        ]
        from beacon.evaluate import evaluate_sources
        await evaluate_sources(sources, "test", client=client)
        assert max_concurrent <= 10

    @pytest.mark.asyncio
    async def test_results_sorted_by_score_descending(self):
        """Returned list must be sorted by learning_efficiency_score descending."""
        client = AsyncMock()
        scores = [3, 9, 1, 7, 5]
        responses = [_make_claude_response(_valid_signals_dict(learning_efficiency_score=s)) for s in scores]
        client.messages.create = AsyncMock(side_effect=responses)

        sources = [
            Source(url=f"https://example.com/{i}", title=f"S{i}", snippet=f"Snip {i}")
            for i in range(5)
        ]
        from beacon.evaluate import evaluate_sources
        results = await evaluate_sources(sources, "test", client=client)
        result_scores = [r.signals.learning_efficiency_score for r in results]
        assert result_scores == sorted(result_scores, reverse=True)

    @pytest.mark.asyncio
    async def test_failed_evaluation_gets_score_zero(self):
        """A source whose evaluation fails should get score=0, content_type='other', evaluation_failed=True."""
        client = AsyncMock()
        client.messages.create = AsyncMock(side_effect=Exception("API down"))

        sources = [Source(url="https://example.com/x", title="X", snippet="Snip")]
        from beacon.evaluate import evaluate_sources
        results = await evaluate_sources(sources, "test", client=client)
        assert results[0].signals.learning_efficiency_score == 0
        assert results[0].signals.content_type == "other"
        assert results[0].signals.evaluation_failed is True

    @pytest.mark.asyncio
    async def test_queue_receives_results(self):
        """When a queue is provided, each result is put onto it."""
        client = AsyncMock()
        client.messages.create = AsyncMock(return_value=_make_claude_response(_valid_signals_dict()))
        queue = asyncio.Queue()

        sources = [
            Source(url=f"https://example.com/{i}", title=f"S{i}", snippet=f"Snip {i}")
            for i in range(3)
        ]
        from beacon.evaluate import evaluate_sources
        await evaluate_sources(sources, "test", client=client, queue=queue)
        assert queue.qsize() == 3
```

---

## Implementation: `beacon/evaluate.py`

### Function signatures

```python
async def evaluate_source(
    source: Source,
    topic: str,
    client: AsyncAnthropic | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> EvaluatedSource:
    """Evaluate a single source's learning efficiency using Claude.

    Sends one Claude API call with the evaluation prompt, parses the JSON response
    into IntelligenceSignals, and returns an EvaluatedSource.

    On failure (malformed JSON, timeout, API error): retries once, then assigns
    default failed signals with score=0 and evaluation_failed=True.

    Args:
        source: The Source to evaluate.
        topic: The research topic (for relevance context in the prompt).
        client: Optional AsyncAnthropic client (dependency injection for tests).
        semaphore: Optional semaphore for concurrency limiting.

    Returns:
        EvaluatedSource with signals populated.
    """
```

```python
async def evaluate_sources(
    sources: list[Source],
    topic: str,
    client: AsyncAnthropic | None = None,
    queue: asyncio.Queue | None = None,
) -> list[EvaluatedSource]:
    """Evaluate all sources in parallel and return sorted results.

    Creates one async task per source, all awaited via asyncio.gather.
    Uses asyncio.Semaphore(10) to limit concurrent Claude API calls.
    Results are sorted by learning_efficiency_score descending.

    Args:
        sources: List of Source objects to evaluate.
        topic: The research topic.
        client: Optional AsyncAnthropic client.
        queue: Optional asyncio.Queue; each EvaluatedSource is put onto it
               as it completes (for real-time progress in the pipeline).

    Returns:
        List of EvaluatedSource sorted by score descending.
    """
```

### Key implementation details

**Claude API call structure**:
```python
response = await client.messages.create(
    model="claude-sonnet-4-6",   # from config.EVAL_MODEL
    max_tokens=512,              # from config.EVAL_MAX_TOKENS
    messages=[{"role": "user", "content": formatted_prompt}],
)
```

**Timeout wrapping**: Each call to `client.messages.create` must be wrapped with:
```python
response = await asyncio.wait_for(
    client.messages.create(...),
    timeout=30,  # from config.EVAL_TIMEOUT
)
```

**Response parsing**: Extract the text from `response.content[0].text`, parse as JSON with `json.loads()`, then validate with `IntelligenceSignals(**parsed_dict)`.

**Retry logic**: If JSON parsing or Pydantic validation fails on the first attempt, retry the Claude call once. If the retry also fails, assign default failed signals.

**Default failed signals**:
```python
IntelligenceSignals(
    learning_efficiency_score=0,
    content_type="other",
    time_estimate_minutes=0,
    recency=None,
    key_insight="Evaluation failed",
    coverage=[],
    evaluation_failed=True,
)
```

Score of 0 ensures failed sources are never selected for deep-read (deep-read picks top N by score).

**Semaphore pattern in evaluate_sources**:
```python
semaphore = asyncio.Semaphore(EVAL_SEMAPHORE_LIMIT)  # 10

async def _eval_with_semaphore(source):
    result = await evaluate_source(source, topic, client=client, semaphore=semaphore)
    if queue is not None:
        await queue.put(result)
    return result

results = await asyncio.gather(*[_eval_with_semaphore(s) for s in sources])
results.sort(key=lambda r: r.signals.learning_efficiency_score, reverse=True)
return results
```

Inside `evaluate_source`, if a semaphore is provided, wrap the entire evaluation in `async with semaphore:`.

**Error handling in gather**: Use `asyncio.gather(*tasks, return_exceptions=False)` since each individual task already handles its own exceptions and returns defaults. No task should ever raise.

---

## Verification Steps

```bash
uv run pytest tests/test_evaluate.py -v
```

All tests should pass. Additionally verify:

1. `from beacon.evaluate import evaluate_source, evaluate_sources` imports cleanly
2. Passing 15 sources with a semaphore of 10 never exceeds 10 concurrent calls
3. A failed evaluation always returns score=0 (never raises an exception)
4. Results are always sorted descending by score

---

## Design Decisions

- **Prompt-based JSON output (not tool_use / structured output)**: The evaluation prompt includes the JSON schema and a few-shot example. Claude returns raw JSON text which is parsed with `json.loads` and validated with Pydantic. This is the most portable and reliable approach. If it proves unreliable, the upgrade path is to use Anthropic's `output_config` with a JSON schema.
- **Retry once, then default**: A single retry handles transient API glitches. After that, defaulting to score=0 ensures the pipeline continues rather than blocking on a single source.
- **Queue parameter for real-time progress**: The pipeline orchestrator (Section 07) uses a Queue to yield `SourceEvaluatedEvent` for each source as it completes. The queue is optional so that `evaluate_sources` can be used standalone in tests.
- **Semaphore passed into evaluate_source**: Rather than creating the semaphore inside each call, it is created once in `evaluate_sources` and passed down. This ensures a single shared semaphore across all concurrent tasks.
- **max_tokens=512**: Sufficient for the structured JSON output (typically 200-300 tokens). Prevents runaway responses that waste API credits.

---

## Implementation Notes (Post-Build)

**Deviations from plan:**
- Exception clause cleaned up from redundant tuple to `except Exception` for clarity (code review fix).
- Added retry-then-succeed test to verify retry logic returns successful result on second attempt (code review fix).
- Logging deferred to pipeline orchestrator (section-07).

**Tests:** 12 tests total (11 original + 1 retry-then-succeed test added during code review).

**Files created:**
- `beacon/evaluate.py` (128 lines)
- `tests/test_evaluate.py` (182 lines)
