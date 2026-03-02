<!-- SPLIT_MANIFEST
01-agent-pipeline
02-api-streaming
03-frontend-dashboard
END_MANIFEST -->

# Beacon - Project Manifest

## Overview

Beacon is decomposed into 3 planning units aligned with its natural system boundaries:

1. **01-agent-pipeline** — The core research agent: search, evaluate, rank, deep-read, synthesize. This is the brain of Beacon. Produces structured data (scored sources + generated artifacts) consumed by the API layer.

2. **02-api-streaming** — FastAPI server with SSE streaming, session management, and Markdown export. Translates the agent pipeline's output into a real-time event stream for the frontend.

3. **03-frontend-dashboard** — Lovable-generated React app. Consumes SSE events, displays the interactive knowledge base, source intelligence cards, artifact tabs, and export controls.

## Dependencies

```
01-agent-pipeline
    ↓ models (Pydantic schemas for sources, artifacts, intelligence signals)
    ↓ APIs (pipeline function that yields progress events)
02-api-streaming
    ↓ APIs (SSE event contract: event types, JSON shapes)
03-frontend-dashboard
```

### Dependency Details

| From | To | Type | What's Shared |
|------|----|------|---------------|
| 01 → 02 | models | Pydantic models for Source, Artifact, IntelligenceSignals |
| 01 → 02 | APIs | Pipeline generator function signature (async generator yielding events) |
| 02 → 03 | APIs | SSE event schema (event types, JSON payload shapes) |
| 02 → 03 | APIs | Export endpoint contract (GET /api/export/{session_id}) |

### Cross-Cutting Concerns
- **Pydantic models**: Defined in 01, imported by 02. Shapes the SSE contract for 03.
- **Error handling**: Pipeline errors in 01 must propagate through 02 as SSE error events to 03.
- **Depth configuration**: User selects depth in 03, sent to 02 as request param, controls 01's search/eval behavior.

## Execution Order

**Sequential**: 01 → 02 → 03

01 must be planned first because it defines the data models and pipeline interface. 02 wraps the pipeline in HTTP/SSE and must know the pipeline's output shape. 03 consumes the SSE events and must know the event schema.

**However**, 02 and 03 can be built in partial parallel after 01:
- Once 01's models and event types are defined, 02 and 03 can be planned concurrently
- 03 can be started with mock SSE data while 02 is still being built

## /deep-plan Commands

Run in order:
```
/deep-plan @01-agent-pipeline/spec.md
/deep-plan @02-api-streaming/spec.md
/deep-plan @03-frontend-dashboard/spec.md
```
