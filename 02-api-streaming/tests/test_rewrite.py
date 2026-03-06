"""Tests for the rewrite module: level prompts and streaming rewrite."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

from beacon.models import EvaluatedSource, IntelligenceSignals, ResearchResult


# ---------------------------------------------------------------------------
# Helpers (same pattern as test_chat.py)
# ---------------------------------------------------------------------------

def _make_source(title="Test", url="https://example.com", score=5, snippet="snippet"):
    """Create a minimal EvaluatedSource for testing."""
    return EvaluatedSource(
        url=url, title=title, snippet=snippet,
        signals=IntelligenceSignals(
            learning_efficiency_score=score, content_type="tutorial",
            time_estimate_minutes=10, recency="2024",
            key_insight="insight", coverage=["test"],
        ),
    )


def _make_result(sources=None, summary="Short summary"):
    """Create a minimal ResearchResult for testing."""
    return ResearchResult(
        topic="test topic", depth="standard",
        sources=sources or [], artifacts={"summary": summary},
        session_id="test-session", timestamp="2024-01-01T00:00:00Z",
    )


# ---------------------------------------------------------------------------
# LEVEL_PROMPTS tests
# ---------------------------------------------------------------------------

class TestLevelPrompts:
    def test_level_prompts_contains_all_five_levels(self):
        from server.rewrite import LEVEL_PROMPTS

        for level in range(1, 6):
            assert level in LEVEL_PROMPTS, f"Level {level} missing from LEVEL_PROMPTS"

    def test_level_prompts_values_are_nonempty_strings(self):
        from server.rewrite import LEVEL_PROMPTS

        for level, prompt in LEVEL_PROMPTS.items():
            assert isinstance(prompt, str), f"Level {level} prompt is not a string"
            assert len(prompt) > 0, f"Level {level} prompt is empty"


# ---------------------------------------------------------------------------
# stream_rewrite tests
# ---------------------------------------------------------------------------

class TestStreamRewrite:
    async def test_yields_delta_events_with_content(self):
        from server.rewrite import stream_rewrite

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "Simplified"
            yield " summary"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.rewrite.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.rewrite.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_rewrite(result, level=1):
                    events.append(json.loads(event_str))

        delta_events = [e for e in events if e["type"] == "delta"]
        assert len(delta_events) == 2
        assert delta_events[0]["content"] == "Simplified"
        assert delta_events[1]["content"] == " summary"

    async def test_yields_done_event_with_level(self):
        from server.rewrite import stream_rewrite

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "response"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.rewrite.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.rewrite.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_rewrite(result, level=2):
                    events.append(json.loads(event_str))

        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["level"] == 2

    async def test_uses_eval_model(self):
        from server.rewrite import stream_rewrite

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "text"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.rewrite.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.rewrite.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                async for _ in stream_rewrite(result, level=4):
                    pass

            from beacon.config import EVAL_MODEL

            call_kwargs = mock_client.messages.stream.call_args
            assert call_kwargs.kwargs.get("model") == EVAL_MODEL or \
                   call_kwargs[1].get("model") == EVAL_MODEL
