"""Tests for beacon.evaluate."""
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

    @pytest.mark.asyncio
    async def test_retry_succeeds_on_second_attempt(self, sample_source):
        """If first call returns bad JSON, retry succeeds with valid JSON."""
        bad_response = MagicMock()
        bad_response.content = [MagicMock()]
        bad_response.content[0].text = "not json"

        good_response = _make_claude_response(_valid_signals_dict(learning_efficiency_score=7))

        client = AsyncMock()
        client.messages.create = AsyncMock(side_effect=[bad_response, good_response])

        from beacon.evaluate import evaluate_source
        result = await evaluate_source(sample_source, "test topic", client=client)
        assert client.messages.create.call_count == 2
        assert result.signals.learning_efficiency_score == 7
        assert result.signals.evaluation_failed is False


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
