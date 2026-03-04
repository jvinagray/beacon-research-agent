# Interview Transcript: 02-API-Streaming

## Q1: How should 02-api-streaming import from 01-agent-pipeline?

The pipeline is a separate package with its own pyproject.toml. Options: path dependency, sys.path manipulation, or monorepo.

**Answer:** Monorepo approach — separate pyproject.toml in 02-api-streaming with a path dependency to ../01-agent-pipeline. Each split is independently installable but connected.

## Q2: SSE implementation library

sse-starlette vs manual StreamingResponse for Server-Sent Events.

**Answer:** Use sse-starlette. Benefits: built-in ping, disconnect detection, W3C compliance. Well-maintained (v3.3.2).

## Q3: Event IDs for client reconnection

Should SSE events include `id` fields for Last-Event-ID reconnection support?

**Answer:** Yes, add sequential event IDs. Enables reconnection. Low implementation cost.

## Q4: Monorepo structure detail

Separate pyproject.toml per split vs single root-level pyproject.toml vs uv workspaces.

**Answer:** Separate pyproject.toml with path dependency (`beacon = {path = "../01-agent-pipeline"}`). Each split independently installable.

## Q5: Session cleanup strategy

Lazy-only (remove expired on access) vs lazy + background task vs no cleanup.

**Answer:** Lazy + background task. Check TTL on access AND run periodic sweep (every 60s). Prevents unbounded memory growth.

## Q6: Frontend SSE contract scope

Should the plan include guidance on how the frontend consumes POST-based SSE, or focus on server side?

**Answer:** Server-side focus only. Frontend (03-frontend) handles its own SSE parsing.

## Q7: Fatal error handling mid-stream

When pipeline hits a fatal error (API key invalid, zero search results): error event + close, retry once, or surface to user?

**Answer:** Attempt retry once before sending fatal error event. Adds some complexity but improves reliability.

## Q8: Markdown export detail level

All artifacts + full signals, summary + sources only, or user-selectable sections?

**Answer:** All artifacts + full intelligence signals. Complete export with everything the pipeline produced.

## Q9: CORS configuration

Hardcode allow-all origins vs environment-based configuration.

**Answer:** Hardcode allow-all origins (`*`) for MVP. Local-only deployment, no security concern.

## Q10: Any additional context?

**Answer:** No, the above decisions cover it. Ready to proceed with the plan.
