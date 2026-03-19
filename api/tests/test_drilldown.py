"""Tests for the drilldown module: streaming sub-research on concepts."""
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
# stream_drilldown tests
# ---------------------------------------------------------------------------


class TestStreamDrilldown:
    async def test_yields_delta_events_with_content(self):
        from server.drilldown import stream_drilldown

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "Deep"
            yield " dive"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.drilldown.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.drilldown.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_drilldown(result, "test concept"):
                    events.append(json.loads(event_str))

        delta_events = [e for e in events if e["type"] == "delta"]
        assert len(delta_events) == 2
        assert delta_events[0]["content"] == "Deep"
        assert delta_events[1]["content"] == " dive"

    async def test_yields_done_event_with_concept(self):
        from server.drilldown import stream_drilldown

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "response"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.drilldown.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.drilldown.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_drilldown(result, "neural networks"):
                    events.append(json.loads(event_str))

        done_events = [e for e in events if e["type"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["concept"] == "neural networks"

    async def test_uses_build_chat_context(self):
        from server.drilldown import stream_drilldown

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "ok"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.drilldown.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.drilldown.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                with patch("server.drilldown.build_chat_context") as mock_ctx:
                    mock_ctx.return_value = "mocked context"

                    events = []
                    async for event_str in stream_drilldown(result, "concept"):
                        events.append(json.loads(event_str))

                    mock_ctx.assert_called_once_with(result)

    async def test_uses_eval_model(self):
        from server.drilldown import stream_drilldown

        mock_stream = AsyncMock()
        mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
        mock_stream.__aexit__ = AsyncMock(return_value=False)

        async def text_iter():
            yield "ok"

        mock_stream.text_stream = text_iter()

        result = _make_result()

        with patch("server.drilldown.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.return_value = mock_stream
            mock_cls.return_value = mock_client

            with patch("server.drilldown.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_drilldown(result, "concept"):
                    events.append(json.loads(event_str))

                from beacon.config import EVAL_MODEL

                call_kwargs = mock_client.messages.stream.call_args
                assert call_kwargs.kwargs["model"] == EVAL_MODEL
                assert call_kwargs.kwargs["max_tokens"] == 4096

    async def test_yields_error_event_on_failure(self):
        from server.drilldown import stream_drilldown

        result = _make_result()

        with patch("server.drilldown.AsyncAnthropic") as mock_cls:
            mock_client = MagicMock()
            mock_client.messages.stream.side_effect = Exception("API down")
            mock_cls.return_value = mock_client

            with patch("server.drilldown.get_config") as mock_cfg:
                mock_cfg.return_value = MagicMock(anthropic_api_key="test-key")

                events = []
                async for event_str in stream_drilldown(result, "concept"):
                    events.append(json.loads(event_str))

        error_events = [e for e in events if e["type"] == "error"]
        assert len(error_events) == 1
        assert "API down" in error_events[0]["message"]
