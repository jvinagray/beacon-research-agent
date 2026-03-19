"""Tests for server.sse: SSE formatting and stream_research generator."""
import json
from unittest.mock import patch

import pytest
from sse_starlette import ServerSentEvent

from beacon.models import (
    ArtifactEvent,
    CompleteEvent,
    ErrorEvent,
    EvaluatedSource,
    PipelineEvent,
    ResearchResult,
    Source,
    SourceEvaluatedEvent,
    SourcesFoundEvent,
    StatusEvent,
)
from server.models import CompleteSummary, ResearchRequest, ResearchSummary
from server.sessions import SessionStore
from server.sse import format_sse_event, stream_research


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


class MockRequest:
    """Minimal mock of starlette.requests.Request for testing stream_research."""

    def __init__(self, disconnect_after: int | None = None):
        self._call_count = 0
        self._disconnect_after = disconnect_after

    async def is_disconnected(self) -> bool:
        self._call_count += 1
        if self._disconnect_after is not None and self._call_count > self._disconnect_after:
            return True
        return False


# ---------------------------------------------------------------------------
# format_sse_event tests
# ---------------------------------------------------------------------------


class TestFormatSseEvent:
    def test_status_event(self):
        event = StatusEvent(message="Searching...")
        sse = format_sse_event(event, event_id=1)

        assert isinstance(sse, ServerSentEvent)
        assert sse.event == "status"
        assert sse.id == "1"
        data = json.loads(sse.data)
        assert data["type"] == "status"
        assert data["message"] == "Searching..."

    def test_sources_found_event(self):
        sources = [
            Source(url="https://example.com", title="Example", snippet="A snippet"),
        ]
        event = SourcesFoundEvent(count=1, sources=sources)
        sse = format_sse_event(event, event_id=2)

        assert sse.event == "sources_found"
        assert sse.id == "2"
        data = json.loads(sse.data)
        assert data["count"] == 1

    def test_source_evaluated_event(self, sample_sources):
        event = SourceEvaluatedEvent(index=0, total=5, source=sample_sources[0])
        sse = format_sse_event(event, event_id=3)

        assert sse.event == "source_evaluated"
        assert sse.id == "3"

    def test_artifact_event(self):
        event = ArtifactEvent(artifact_type="summary", data="Some summary text")
        sse = format_sse_event(event, event_id=4)

        assert sse.event == "artifact"
        assert sse.id == "4"

    def test_error_event(self):
        event = ErrorEvent(message="Something failed", recoverable=True)
        sse = format_sse_event(event, event_id=5)

        assert sse.event == "error"
        data = json.loads(sse.data)
        assert data["recoverable"] is True

    def test_complete_event_sends_summary_not_full_result(
        self, sample_research_result
    ):
        event = CompleteEvent(
            session_id="test-session-123", result=sample_research_result
        )
        sse = format_sse_event(event, event_id=6)

        assert sse.event == "complete"
        data = json.loads(sse.data)
        assert data["session_id"] == "test-session-123"
        assert "summary" in data
        # Must NOT contain full result fields
        assert "sources" not in data
        assert "artifacts" not in data
        assert "deep_read_content" not in data

    def test_complete_event_summary_fields(self, sample_research_result):
        event = CompleteEvent(
            session_id="test-session-123", result=sample_research_result
        )
        sse = format_sse_event(event, event_id=7)

        data = json.loads(sse.data)
        summary = data["summary"]
        assert summary["source_count"] == len(sample_research_result.sources)
        assert summary["artifact_types"] == sorted(
            sample_research_result.artifacts.keys()
        )

    def test_event_id_increments(self):
        events = [
            StatusEvent(message="a"),
            StatusEvent(message="b"),
            StatusEvent(message="c"),
        ]
        for i, ev in enumerate(events, start=1):
            sse = format_sse_event(ev, event_id=i)
            assert sse.id == str(i)

    def test_sse_wire_format_serialization(self):
        """Verify events can be serialized to SSE wire format."""
        event = StatusEvent(message="Searching...")
        sse = format_sse_event(event, event_id=1)

        encoded = sse.encode()
        text = encoded.decode("utf-8")
        assert "event: status" in text
        assert "id: 1" in text
        assert "data: " in text
        assert '"message":"Searching..."' in text


# ---------------------------------------------------------------------------
# stream_research tests
# ---------------------------------------------------------------------------


class TestStreamResearch:
    @pytest.fixture
    def request_obj(self):
        return MockRequest()

    @pytest.fixture
    def research_req(self):
        return ResearchRequest(topic="async python", depth="standard")

    @pytest.fixture
    def store(self):
        return SessionStore(ttl_seconds=60, max_sessions=10)

    async def _collect(self, gen):
        """Collect all events from an async generator."""
        events = []
        async for ev in gen:
            events.append(ev)
        return events

    async def test_yields_events_in_order(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        sample_research_result,
    ):
        events_in = [
            StatusEvent(message="Searching..."),
            SourcesFoundEvent(
                count=1,
                sources=[Source(url="https://x.com", title="X", snippet="s")],
            ),
            CompleteEvent(session_id="s1", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert len(results) == 3
        assert results[0].event == "status"
        assert results[1].event == "sources_found"
        assert results[2].event == "complete"

    async def test_sequential_event_ids(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        sample_research_result,
    ):
        events_in = [
            StatusEvent(message="a"),
            StatusEvent(message="b"),
            StatusEvent(message="c"),
            StatusEvent(message="d"),
            CompleteEvent(session_id="s1", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert [r.id for r in results] == ["1", "2", "3", "4", "5"]

    async def test_stores_result_on_complete_with_sources(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        sample_research_result,
    ):
        events_in = [
            CompleteEvent(session_id="test-session-123", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            await self._collect(stream_research(request_obj, research_req, store))

        stored = await store.get("test-session-123")
        assert stored is not None
        assert stored.topic == sample_research_result.topic

    async def test_does_not_store_empty_result(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        empty_research_result,
    ):
        events_in = [
            CompleteEvent(
                session_id="empty-session-456", result=empty_research_result
            ),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            await self._collect(stream_research(request_obj, research_req, store))

        stored = await store.get("empty-session-456")
        assert stored is None

    async def test_recoverable_error_continues_stream(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        sample_research_result,
    ):
        events_in = [
            StatusEvent(message="start"),
            ErrorEvent(message="partial failure", recoverable=True),
            StatusEvent(message="continuing"),
            CompleteEvent(session_id="s1", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert len(results) == 4

    async def test_fatal_error_continues_to_complete(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        sample_research_result,
    ):
        events_in = [
            StatusEvent(message="start"),
            ErrorEvent(message="fatal", recoverable=False),
            CompleteEvent(session_id="s1", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert len(results) == 3

    async def test_stops_on_client_disconnect(
        self,
        mock_pipeline,
        research_req,
        store,
        sample_research_result,
    ):
        request_obj = MockRequest(disconnect_after=1)
        events_in = [
            StatusEvent(message="first"),
            StatusEvent(message="second"),
            CompleteEvent(session_id="s1", result=sample_research_result),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert len(results) == 1

    async def test_fatal_error_empty_result_not_stored(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
        empty_research_result,
    ):
        events_in = [
            ErrorEvent(message="fatal", recoverable=False),
            CompleteEvent(
                session_id="empty-session-456", result=empty_research_result
            ),
        ]
        with patch("server.sse.run_research", mock_pipeline(events_in)):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        assert len(results) == 2
        stored = await store.get("empty-session-456")
        assert stored is None

    async def test_happy_path_all_event_types(
        self,
        mock_pipeline,
        request_obj,
        research_req,
        store,
    ):
        """Full happy path using the default mock_pipeline sequence."""
        with patch("server.sse.run_research", mock_pipeline()):
            results = await self._collect(
                stream_research(request_obj, research_req, store)
            )
        event_names = [r.event for r in results]
        assert event_names[0] == "status"
        assert event_names[1] == "sources_found"
        assert "source_evaluated" in event_names
        assert "artifact" in event_names
        assert event_names[-1] == "complete"
        # Verify result was stored in session
        stored = await store.get("test-session-123")
        assert stored is not None

