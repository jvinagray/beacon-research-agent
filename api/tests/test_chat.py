"""Tests for the chat module: context builder and streaming response."""
import json

from unittest.mock import AsyncMock, MagicMock, patch

from beacon.models import EvaluatedSource, IntelligenceSignals, ResearchResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_source(
    title="Test",
    url="https://example.com",
    score=5,
    snippet="snippet",
    deep_read_content=None,
    key_insight="insight",
):
    return EvaluatedSource(
        url=url,
        title=title,
        snippet=snippet,
        signals=IntelligenceSignals(
            learning_efficiency_score=score,
            content_type="tutorial",
            time_estimate_minutes=10,
            recency="2024",
            key_insight=key_insight,
            coverage=["test"],
        ),
        deep_read_content=deep_read_content,
    )


def _make_result(sources=None, summary="Short summary"):
    return ResearchResult(
        topic="test topic",
        depth="standard",
        sources=sources or [],
        artifacts={"summary": summary},
        session_id="test-session",
        timestamp="2024-01-01T00:00:00Z",
    )


# ---------------------------------------------------------------------------
# build_chat_context tests
# ---------------------------------------------------------------------------


class TestBuildChatContext:
    def test_summary_truncated_to_3000_chars(self):
        from server.chat import build_chat_context

        long_summary = "x" * 5000
        result = _make_result(summary=long_summary)
        context = build_chat_context(result)
        assert long_summary[:3000] in context
        assert long_summary not in context

    def test_selects_top_8_sources_by_score(self):
        from server.chat import build_chat_context

        # Use letter-based names to avoid substring collisions (e.g. "A" in "AB")
        names = ["alpha", "bravo", "charlie", "delta",
                 "echo", "foxtrot", "golf", "hotel",
                 "india", "juliet", "kilo", "lima"]
        scores = list(range(11)) + [10]
        sources = [_make_source(title=names[i], score=scores[i]) for i in range(12)]
        result = _make_result(sources=sources)
        context = build_chat_context(result)
        # Top 8 by score: kilo(10), lima(10), juliet(9), india(8),
        #                  hotel(7), golf(6), foxtrot(5), echo(4)
        for name in ["echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"]:
            assert name in context
        # Excluded: alpha(0), bravo(1), charlie(2), delta(3)
        for name in ["alpha", "bravo", "charlie", "delta"]:
            assert name not in context

    def test_truncates_deep_read_content_to_4000_chars(self):
        from server.chat import build_chat_context

        long_content = "y" * 6000
        source = _make_source(deep_read_content=long_content)
        result = _make_result(sources=[source])
        context = build_chat_context(result)
        assert long_content[:4000] in context
        assert long_content not in context

    def test_falls_back_to_snippet_when_deep_read_none(self):
        from server.chat import build_chat_context

        source = _make_source(snippet="my snippet text", deep_read_content=None)
        result = _make_result(sources=[source])
        context = build_chat_context(result)
        assert "my snippet text" in context

    def test_includes_source_metadata(self):
        from server.chat import build_chat_context

        source = _make_source(
            title="Great Tutorial",
            url="https://example.com/great",
            key_insight="Key learning point",
        )
        result = _make_result(sources=[source])
        context = build_chat_context(result)
        assert "Great Tutorial" in context
        assert "https://example.com/great" in context
        assert "Key learning point" in context


# ---------------------------------------------------------------------------
# stream_chat_response tests
# ---------------------------------------------------------------------------


class TestStreamChatResponse:
    async def test_yields_delta_events_with_text(self):
        from server.chat import stream_chat_response

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "Hello"
            yield " World"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.chat.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.chat.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_chat_response(result, "Hi", []):
                    events.append(json.loads(event_str))

        delta_events = [e for e in events if e["type"] == "delta"]
        assert len(delta_events) == 2
        assert delta_events[0]["content"] == "Hello"
        assert delta_events[1]["content"] == " World"

    async def test_yields_done_event_with_sources(self):
        from server.chat import stream_chat_response

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "response"

        mock_stream.text_stream = text_iter()

        source = _make_source(title="Test Source", url="https://example.com/src", score=8)
        result = _make_result(sources=[source])

        with patch("server.chat.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.chat.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_chat_response(result, "Hi", []):
                    events.append(json.loads(event_str))

        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["sources"][0]["title"] == "Test Source"
        assert done_events[0]["sources"][0]["url"] == "https://example.com/src"

    async def test_yields_error_event_on_failure(self):
        from server.chat import stream_chat_response

        result = _make_result()

        with patch("server.chat.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.side_effect = Exception("API down")
            mock_cls.return_value = mock_client

            with patch("server.chat.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_chat_response(result, "Hi", []):
                    events.append(json.loads(event_str))

        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        assert "API down" in error_events[0]["message"]
