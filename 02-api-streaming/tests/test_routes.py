"""Tests for server routes: health, research SSE, and export endpoints."""
import json


def parse_sse_events(raw_bytes: bytes) -> list[dict]:
    """Parse raw SSE text/event-stream bytes into a list of event dicts.

    Each dict has keys: 'event' (str), 'id' (str|None), 'data' (str).
    Events are separated by blank lines.
    """
    events = []
    current: dict = {}
    for line in raw_bytes.decode("utf-8").splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:"):].strip()
        elif line.startswith("id:"):
            current["id"] = line[len("id:"):].strip()
        elif line.startswith("data:"):
            current["data"] = line[len("data:"):].strip()
        elif line.strip() == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    async def test_health_returns_200(self, client):
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_returns_ok_status(self, client):
        response = await client.get("/health")
        assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# App lifespan / startup state
# ---------------------------------------------------------------------------


class TestAppLifespan:
    async def test_app_has_session_store(self, client, app):
        from server.sessions import SessionStore

        assert hasattr(app.state, "sessions")
        assert isinstance(app.state.sessions, SessionStore)

    async def test_app_has_research_semaphore(self, client, app):
        import asyncio

        assert hasattr(app.state, "research_semaphore")
        assert isinstance(app.state.research_semaphore, asyncio.Semaphore)

    async def test_cors_headers_present(self, client):
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "*"

    async def test_cors_no_credentials_header(self, client):
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        creds = response.headers.get("access-control-allow-credentials")
        assert creds is None or creds != "true"


# ---------------------------------------------------------------------------
# POST /api/research SSE streaming
# ---------------------------------------------------------------------------


class TestResearchEndpoint:
    async def test_returns_200_event_stream(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Python asyncio", "depth": "standard"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

    async def test_returns_422_missing_topic(self, client):
        response = await client.post(
            "/api/research",
            json={"depth": "quick"},
        )
        assert response.status_code == 422

    async def test_returns_422_invalid_depth(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Test", "depth": "ultra"},
        )
        assert response.status_code == 422

    async def test_sse_stream_contains_expected_event_types(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Python asyncio", "depth": "standard"},
        )
        events = parse_sse_events(response.content)
        assert len(events) > 0

        event_types = [e.get("event") for e in events if e.get("event")]
        assert "status" in event_types
        assert "complete" in event_types

    async def test_sse_events_have_sequential_ids(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "quick"},
        )
        events = parse_sse_events(response.content)
        ids = [int(e["id"]) for e in events if e.get("id")]
        assert ids == list(range(1, len(ids) + 1))

    async def test_complete_event_has_session_id(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)
        complete_events = [e for e in events if e.get("event") == "complete"]
        assert len(complete_events) == 1

        data = json.loads(complete_events[0]["data"])
        assert "session_id" in data
        assert "summary" in data

    async def test_complete_event_does_not_contain_full_result(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)
        complete_events = [e for e in events if e.get("event") == "complete"]
        data = json.loads(complete_events[0]["data"])

        assert "sources" not in data
        assert "artifacts" not in data
        assert "deep_read_content" not in data

    async def test_stream_ends_after_complete(self, client):
        response = await client.post(
            "/api/research",
            json={"topic": "Test topic", "depth": "standard"},
        )
        events = parse_sse_events(response.content)
        non_ping_events = [
            e for e in events if e.get("event") and e["event"] != "ping"
        ]
        if non_ping_events:
            assert non_ping_events[-1]["event"] == "complete"


# ---------------------------------------------------------------------------
# GET /api/export/{session_id}
# ---------------------------------------------------------------------------


class TestExportEndpoint:
    async def test_returns_404_unknown_session(self, client):
        response = await client.get("/api/export/nonexistent-session-id")
        assert response.status_code == 404

    async def test_returns_200_with_markdown_for_valid_session(
        self, client, app, sample_research_result
    ):
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        assert response.status_code == 200

    async def test_response_has_content_disposition_header(
        self, client, app, sample_research_result
    ):
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        assert "content-disposition" in response.headers
        assert "attachment" in response.headers["content-disposition"]
        assert ".md" in response.headers["content-disposition"]

    async def test_filename_contains_topic_slug(
        self, client, app, sample_research_result
    ):
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        disposition = response.headers["content-disposition"]
        assert "beacon-research-" in disposition

    async def test_response_media_type_is_octet_stream(
        self, client, app, sample_research_result
    ):
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        content_type = response.headers.get("content-type", "")
        assert "application/octet-stream" in content_type

    async def test_response_body_is_valid_markdown(
        self, client, app, sample_research_result
    ):
        sessions = app.state.sessions
        await sessions.store("test-export-session", sample_research_result)

        response = await client.get("/api/export/test-export-session")
        body = response.text
        assert f"# Research: {sample_research_result.topic}" in body

    async def test_returns_404_for_expired_session(
        self, client, app, sample_research_result
    ):
        from datetime import datetime, timedelta, timezone

        sessions = app.state.sessions
        await sessions.store("expired-session", sample_research_result)
        sessions._timestamps["expired-session"] = datetime.now(
            timezone.utc
        ) - timedelta(hours=2)

        response = await client.get("/api/export/expired-session")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Concurrency control
# ---------------------------------------------------------------------------


class TestConcurrencyControl:
    async def test_returns_429_when_semaphore_full(self, client, app):
        semaphore = app.state.research_semaphore

        acquired = []
        for _ in range(3):
            await semaphore.acquire()
            acquired.append(True)

        try:
            response = await client.post(
                "/api/research",
                json={"topic": "Blocked topic", "depth": "quick"},
            )
            assert response.status_code == 429
            data = response.json()
            assert "error" in data or "detail" in data
        finally:
            for _ in acquired:
                semaphore.release()

    async def test_semaphore_released_after_stream_completes(self, client, app):
        semaphore = app.state.research_semaphore

        response = await client.post(
            "/api/research",
            json={"topic": "Test", "depth": "quick"},
        )
        assert response.status_code == 200

        acquired = 0
        for _ in range(3):
            if semaphore._value > 0:
                await semaphore.acquire()
                acquired += 1

        for _ in range(acquired):
            semaphore.release()

        assert acquired == 3
