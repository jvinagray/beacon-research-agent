# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-03-02

---

## Plan Review: 02-API-Streaming Layer

### Overall Assessment

This is a well-structured, clearly written implementation plan. The architecture is appropriate for an MVP, the decisions are sound, and the plan faithfully represents the upstream pipeline interface. That said, there are several issues ranging from interface mismatches to subtle concurrency bugs that could cause real implementation problems.

---

### 1. Critical: Fatal Error Retry Strategy Is Fundamentally Broken

**Section 8 (Error Handling Strategy)** describes retrying `run_research()` from the beginning on fatal error. This is problematic for multiple reasons.

**The pipeline already handles its own fatal errors gracefully.** Looking at the actual pipeline code in `pipeline.py` (lines 226-242), `run_research()` catches its own `Exception`, yields an `ErrorEvent(recoverable=False)`, and then yields a `CompleteEvent` with empty results. It never raises an unhandled exception to the caller (except `GeneratorExit`). So the retry logic in the API layer will never trigger for pipeline-originated fatal errors, because they arrive as yielded events, not raised exceptions.

**Duplicate events on retry.** If you did somehow restart the pipeline, the client would receive a jumbled stream: events from the first attempt (partial), then events from the second attempt (starting over). The plan says "reset the event counter" but the client has already received and rendered partial data.

**Session ID mismatch.** The plan acknowledges in a note that "a retry will produce a different session_id" but does not address the implication.

**Recommendation:** Drop the retry-from-scratch logic. The pipeline already yields `ErrorEvent(recoverable=False)` followed by `CompleteEvent` for fatal cases. The API layer should simply forward these events.

---

### 2. Interface Mismatch: CompleteEvent Always Yields After Fatal Errors

**Section 6 (SSE Streaming)** says that on `CompleteEvent`, the result is stored in the session store. But the pipeline yields `CompleteEvent` with empty results after fatal errors (lines 84-99, 147-162, 229-242 of `pipeline.py`).

Should the session store save empty/failed results? If it does, the export endpoint will generate a nearly empty Markdown document. If it does not, the user may see a session_id in the `complete` event but get a 404 on export.

**Recommendation:** Add explicit logic to only store results in the session store when the `CompleteEvent.result` has meaningful content (e.g., non-empty sources or artifacts). Alternatively, store it but add a status field so the export endpoint can return a meaningful error.

---

### 3. CORS Misconfiguration: `allow_origins=["*"]` with `allow_credentials=True`

Per the CORS specification, `Access-Control-Allow-Origin: *` cannot be combined with `Access-Control-Allow-Credentials: true`. Browsers will reject such responses.

**Recommendation:** Remove `allow_credentials=True` (no auth needed) or set specific origins.

---

### 4. Session Store Concurrency: Lock Granularity May Cause Unnecessary Contention

The `cleanup_expired()` method acquires the lock and scans all sessions. During this scan, all `store()` and `get()` calls are blocked.

**Recommendation:** Document that `get()` requires the lock for conditional mutation. Consider processing cleanup in batches.

---

### 5. Missing: No Concurrency Limit on Pipeline Runs

Each `POST /api/research` starts a new pipeline with multiple API calls. No rate limiting exists.

**Recommendation:** Add `max_concurrent_research` setting (default 3) via `asyncio.Semaphore`. Return HTTP 429 when exceeded.

---

### 6. Missing: Topic Slug Sanitization in Export Filename

On Windows, filenames cannot contain `\ / : * ? " < > |`. Non-ASCII characters need RFC 6266 `filename*` encoding.

**Recommendation:** Specify the slug algorithm precisely: ASCII normalization, non-alphanumeric to hyphens, collapse/strip, truncate to 50 chars.

---

### 7. Missing: `ResearchResult.artifacts` Type Is `dict[str, Any]` -- Export Fragility

The export function must defensively handle unexpected keys, JSON strings, and None values.

**Recommendation:** Add explicit type-checking logic for each artifact type.

---

### 8. Potential Issue: `request.is_disconnected()` Behavior

`sse-starlette` already handles disconnection via `CancelledError`. The `is_disconnected()` check is redundant but harmless.

**Recommendation:** Keep as defense-in-depth but note it is secondary.

---

### 9. High: Path Dependency Syntax Is Wrong

`beacon @ file:///${PROJECT_ROOT}/../01-agent-pipeline` is not valid. For uv with hatchling:

```toml
[project]
dependencies = ["beacon"]

[tool.uv.sources]
beacon = { path = "../01-agent-pipeline" }
```

**Recommendation:** Specify correct uv syntax.

---

### 10. Missing: pytest asyncio_mode Config

Pipeline uses `asyncio_mode = "auto"`. Plan should include same config.

---

### 11. SSE `complete` Event Data Mismatch

`CompleteSummary` fields don't match the spec's wire format. Be explicit about the complete event JSON shape for the frontend team.

---

### 12. Missing: Logging Configuration

Add note about `logging.basicConfig()` or uvicorn logging config.

---

### 13. Missing: `.env` File Handling

When running from `02-api-streaming/`, the pipeline's `.env` file isn't in the working directory.

**Recommendation:** Document `.env` file placement or environment variable setup.

---

### 14. Minor: `send_timeout` Semantics

Note that `ping=15` ensures sends happen frequently, and `send_timeout=30` applies to individual sends.

---

### 15. Missing: Test Strategy for SSE Streaming

Testing SSE responses with httpx requires streaming and manual parsing. Add guidance.

---

### Summary of Findings

| # | Severity | Issue |
|---|----------|-------|
| 1 | Critical | Retry strategy cannot trigger given pipeline's error handling |
| 2 | High | No handling for CompleteEvent with empty/failed results |
| 3 | Medium | CORS `allow_origins=["*"]` + `allow_credentials=True` is spec-invalid |
| 4 | Low | Lock contention during cleanup sweep |
| 5 | Medium | No concurrency limit on concurrent pipeline runs |
| 6 | Medium | Topic slug sanitization is underspecified |
| 7 | Medium | Export function lacks defensive handling for `dict[str, Any]` artifacts |
| 8 | Low | `is_disconnected()` is redundant with sse-starlette's built-in handling |
| 9 | High | Path dependency syntax is wrong / unresolved for uv + hatchling |
| 10 | Low | Missing pytest asyncio_mode config |
| 11 | Medium | Complete event wire format is ambiguous |
| 12 | Low | No logging configuration |
| 13 | Medium | `.env` file path not addressed |
| 14 | Low | `send_timeout` semantics could be clearer |
| 15 | Low | No guidance on testing SSE streaming |
