# Integration Notes: Opus Review Feedback

## Integrating

### 1. (Critical) Fatal Error Retry Strategy — INTEGRATING
The reviewer is correct: `run_research()` already catches all exceptions internally and yields `ErrorEvent(recoverable=False)` followed by `CompleteEvent`. The retry-from-scratch logic would never trigger and adds complexity. **Removing the retry logic.** The API layer will simply forward pipeline events as-is.

### 2. (High) CompleteEvent with empty/failed results — INTEGRATING
Good catch. The pipeline yields CompleteEvent with empty sources/artifacts after fatal errors. The session store should only save results that have meaningful content. **Adding a check**: only store when `result.sources` is non-empty OR `result.artifacts` is non-empty.

### 3. (Medium) CORS misconfiguration — INTEGRATING
`allow_origins=["*"]` + `allow_credentials=True` violates CORS spec. Since we have no auth, **removing `allow_credentials=True`**.

### 5. (Medium) Concurrency limit on pipeline runs — INTEGRATING
Good point for robustness. **Adding `asyncio.Semaphore(3)` for max concurrent research runs**, returning HTTP 429 when exceeded.

### 6. (Medium) Topic slug sanitization — INTEGRATING
**Specifying the algorithm**: `unicodedata.normalize('NFKD')` → encode ASCII ignore → decode → regex `[^a-z0-9]+` to hyphens → strip leading/trailing hyphens → truncate to 50 chars.

### 7. (Medium) Export defensive handling — INTEGRATING
**Adding explicit type-checking** for each artifact type in the export function. Try parse JSON strings, handle None, handle unexpected keys gracefully.

### 9. (High) Path dependency syntax — INTEGRATING
**Correcting to proper uv syntax**: `[tool.uv.sources]` section with `beacon = { path = "../01-agent-pipeline" }`.

### 10. (Low) pytest asyncio_mode — INTEGRATING
**Adding `asyncio_mode = "auto"` and `testpaths = ["tests"]`** to pyproject.toml.

### 11. (Medium) Complete event wire format — INTEGRATING
**Specifying exact JSON shape** for the complete event, aligned with the spec.

### 12. (Low) Logging configuration — INTEGRATING
**Adding a note** about configuring logging in the app factory.

### 13. (Medium) .env file handling — INTEGRATING
**Adding guidance** on .env file placement for 02-api-streaming.

### 15. (Low) Test strategy for SSE — INTEGRATING
**Adding guidance** on testing SSE with httpx AsyncClient streaming.

## Not Integrating

### 4. (Low) Lock contention during cleanup — NOT INTEGRATING
For an MVP with single-digit concurrent users and max 1000 sessions, a single lock scan every 60 seconds is negligible. Batch processing adds unnecessary complexity. The lock scope is already documented.

### 8. (Low) `request.is_disconnected()` redundancy — NOT INTEGRATING (keeping as-is)
The plan already uses it as a defense-in-depth check. It's low overhead and provides an explicit exit point in the generator loop. Keeping it alongside sse-starlette's built-in handling.

### 14. (Low) send_timeout semantics — NOT INTEGRATING
The current description is adequate for an implementation plan. The implementer can consult sse-starlette docs for precise semantics.
