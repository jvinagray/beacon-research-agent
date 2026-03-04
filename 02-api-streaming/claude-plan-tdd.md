# TDD Plan: 02-API-Streaming Layer

Mirrors the structure of `claude-plan.md`. For each section, defines test stubs to write BEFORE implementing. Uses pytest + pytest-asyncio, following the patterns established in 01-agent-pipeline (fixtures in conftest.py, AsyncMock for external dependencies).

---

## 3. Package Configuration

No tests needed — this is configuration. Verify by running `uv sync` and confirming imports work.

---

## 4. FastAPI Application (app.py)

### Tests in test_routes.py (app-level)

```python
# Test: app starts without error and health endpoint is accessible
# Test: app.state.sessions is a SessionStore instance after startup
# Test: app.state.research_semaphore is an asyncio.Semaphore after startup
# Test: CORS headers are present on responses (Access-Control-Allow-Origin: *)
# Test: CORS does NOT include Access-Control-Allow-Credentials header
# Test: background cleanup task is running after startup
```

---

## 5. Request/Response Models

### Tests in test_sse.py (model validation)

```python
# Test: ResearchRequest accepts valid depth values ("quick", "standard", "deep")
# Test: ResearchRequest rejects invalid depth value (e.g., "ultra")
# Test: ResearchRequest requires topic field (non-empty string)
# Test: CompleteSummary serializes to expected JSON shape with type="complete"
# Test: ResearchSummary includes topic, depth, source_count, artifact_types
```

---

## 6. SSE Streaming (sse.py)

### Tests in test_sse.py

#### format_sse_event

```python
# Test: StatusEvent formats with event="status", sequential id, JSON data
# Test: SourcesFoundEvent formats with event="sources_found"
# Test: SourceEvaluatedEvent formats with event="source_evaluated"
# Test: ArtifactEvent formats with event="artifact"
# Test: ErrorEvent formats with event="error"
# Test: CompleteEvent formats with event="complete" and CompleteSummary (not full result)
# Test: CompleteEvent summary includes correct source_count and artifact_types
# Test: event id increments sequentially
```

#### stream_research generator

```python
# Test: yields SSE events for each pipeline event in order
# Test: maintains sequential event IDs across all events
# Test: stores ResearchResult in session store on CompleteEvent with non-empty sources
# Test: does NOT store result when CompleteEvent has empty sources and empty artifacts
# Test: forwards ErrorEvent(recoverable=True) and continues streaming
# Test: forwards ErrorEvent(recoverable=False) and continues to CompleteEvent
# Test: stops yielding when request is disconnected
# Test: handles pipeline that yields only ErrorEvent + CompleteEvent (fatal failure)
# Test: handles pipeline with no errors (happy path through all event types)
```

---

## 7. Session Management (sessions.py)

### Tests in test_sessions.py

#### Basic CRUD

```python
# Test: store() saves a ResearchResult retrievable by session_id
# Test: get() returns None for unknown session_id
# Test: get() returns stored result for known session_id
# Test: get() updates timestamp on access (sliding window)
```

#### Expiration

```python
# Test: get() returns None for expired session (TTL exceeded)
# Test: get() removes expired session from store
# Test: session not expired when accessed within TTL
# Test: sliding window TTL resets on access
```

#### Cleanup

```python
# Test: cleanup_expired() removes all expired sessions
# Test: cleanup_expired() does not remove non-expired sessions
# Test: cleanup_expired() returns count of removed sessions
# Test: cleanup_expired() handles empty store
```

#### Capacity

```python
# Test: store() evicts oldest session when max_sessions reached
# Test: eviction removes the session with the oldest timestamp
# Test: store() succeeds after eviction (count stays at max)
```

#### Concurrency

```python
# Test: concurrent store() calls don't corrupt state
# Test: concurrent get() and cleanup_expired() don't raise
```

---

## 8. Error Handling Strategy

### Tests in test_sse.py (covered by stream_research tests above)

```python
# Test: recoverable ErrorEvent is forwarded as SSE event, stream continues
# Test: fatal ErrorEvent is forwarded, followed by CompleteEvent
# Test: empty result from fatal error is not stored in session
# Test: pipeline exception (GeneratorExit) is handled gracefully
```

---

## 9. Routes (routes.py)

### Tests in test_routes.py

#### POST /api/research

```python
# Test: returns 200 with content-type text/event-stream for valid request
# Test: returns 422 for missing topic
# Test: returns 422 for invalid depth value
# Test: returns 429 when concurrent research limit exceeded
# Test: SSE stream contains expected event types in order (mock pipeline)
# Test: SSE events have sequential id fields
# Test: stream ends after complete event
```

#### GET /api/export/{session_id}

```python
# Test: returns 200 with markdown content for valid session_id
# Test: returns 404 for unknown session_id
# Test: returns 404 for expired session_id
# Test: response has Content-Disposition header with filename
# Test: filename contains sanitized topic slug
# Test: response media type is application/octet-stream
```

#### GET /health

```python
# Test: returns 200 with {"status": "ok"}
```

#### Concurrency control

```python
# Test: semaphore limits concurrent research to 3
# Test: semaphore is released after stream completes
# Test: semaphore is released after stream errors
# Test: semaphore is released after client disconnect
```

---

## 10. Markdown Export (export.py)

### Tests in test_export.py

#### Happy path

```python
# Test: generates markdown with header including topic, depth, date, source count
# Test: includes executive summary section
# Test: includes sources section with all intelligence signal fields
# Test: sources are ordered by learning_efficiency_score descending
# Test: includes concept map section
# Test: includes flashcards section with Q&A format
# Test: includes resources section
# Test: includes footer
```

#### Edge cases and defensive handling

```python
# Test: handles missing summary artifact (shows "Not generated" note)
# Test: handles missing concept_map artifact
# Test: handles None artifact value (same as missing)
# Test: handles empty sources list (shows "No sources found")
# Test: handles flashcards as list[Flashcard] objects
# Test: handles flashcards as JSON string (parses and formats)
# Test: handles resources as JSON string (parses and formats)
# Test: handles malformed JSON in resources (falls back to raw text)
# Test: handles unexpected artifact keys (ignores them)
```

#### Topic slug

```python
# Test: slug is lowercase with hyphens
# Test: slug handles Unicode characters (normalized to ASCII)
# Test: slug removes special characters (Windows-unsafe chars)
# Test: slug truncates to 50 characters
# Test: slug strips leading/trailing hyphens
# Test: slug collapses multiple hyphens to single
```

---

## Testing Fixtures (conftest.py)

```python
# Fixture: mock_pipeline — AsyncGenerator yielding a controlled sequence of PipelineEvent objects
# Fixture: sample_research_result — ResearchResult with realistic data (sources, artifacts)
# Fixture: empty_research_result — ResearchResult with empty sources and artifacts
# Fixture: session_store — Fresh SessionStore instance with short TTL for testing
# Fixture: app — FastAPI app instance with mocked pipeline (patches run_research)
# Fixture: client — httpx.AsyncClient configured for the test app
# Fixture: sample_sources — List of EvaluatedSource with signals
# Fixture: sample_flashcards — List of Flashcard objects
```

---

## Test Execution

```
cd 02-api-streaming
uv run pytest tests/ -v
```

All tests use `asyncio_mode = "auto"` (configured in pyproject.toml), so no `@pytest.mark.asyncio` decorators needed.
