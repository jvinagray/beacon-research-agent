# Section 02: Pydantic Request/Response Models

## Overview

This section implements the API-layer Pydantic models that are separate from the pipeline's domain models. These models define the shape of HTTP request bodies and SSE response payloads. They live in `C:\git_repos\playground\hackathon\02-api-streaming\server\models.py` with tests in `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_models.py`.

**Dependencies:** Section 01 (foundation) must be complete -- `pyproject.toml`, directory structure, `server/__init__.py`, `tests/__init__.py`, and `tests/conftest.py` must exist.

**Blocked by this section:** Sections 05 (SSE) and 06 (Routes/App) depend on these models.

---

## Background: Pipeline Models (Read-Only Reference)

The pipeline package (`beacon.models`) defines domain models. The API models in this section reference some of these types conceptually but do NOT re-export or duplicate them. For context, the relevant pipeline types are:

- `ResearchResult` -- has fields `topic: str`, `depth: str`, `sources: list[EvaluatedSource]`, `artifacts: dict[str, Any]`, `session_id: str`, `timestamp: str`
- `CompleteEvent` -- has fields `type: Literal["complete"]`, `session_id: str`, `result: ResearchResult`
- `EvaluatedSource` -- evaluated search result with intelligence signals
- `Flashcard` -- question/answer pair

These are imported from `beacon.models` and used elsewhere in the API layer (SSE, routes, export). This section only creates the NEW models needed for the API surface.

---

## Tests First

File: `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_models.py`

Write the following tests before implementing the models. All tests use `asyncio_mode = "auto"` from `pyproject.toml`, so no `@pytest.mark.asyncio` decorators are needed. These are synchronous tests (Pydantic validation is sync).

### ResearchRequest Validation Tests

```python
import pytest
from pydantic import ValidationError
from server.models import ResearchRequest, CompleteSummary, ResearchSummary


class TestResearchRequest:
    """Tests for ResearchRequest model validation."""

    def test_accepts_valid_depth_quick(self):
        """ResearchRequest accepts depth='quick'."""
        req = ResearchRequest(topic="Python asyncio", depth="quick")
        assert req.depth == "quick"
        assert req.topic == "Python asyncio"

    def test_accepts_valid_depth_standard(self):
        """ResearchRequest accepts depth='standard'."""
        req = ResearchRequest(topic="Machine learning", depth="standard")
        assert req.depth == "standard"

    def test_accepts_valid_depth_deep(self):
        """ResearchRequest accepts depth='deep'."""
        req = ResearchRequest(topic="Quantum computing", depth="deep")
        assert req.depth == "deep"

    def test_rejects_invalid_depth(self):
        """ResearchRequest rejects invalid depth value like 'ultra'."""
        with pytest.raises(ValidationError):
            ResearchRequest(topic="Test topic", depth="ultra")

    def test_requires_topic_field(self):
        """ResearchRequest requires a topic field."""
        with pytest.raises(ValidationError):
            ResearchRequest(depth="quick")
```

### CompleteSummary and ResearchSummary Serialization Tests

```python
class TestCompleteSummary:
    """Tests for CompleteSummary serialization."""

    def test_serializes_with_type_complete(self):
        """CompleteSummary serializes to JSON with type='complete'."""
        summary = ResearchSummary(
            topic="Python asyncio",
            depth="standard",
            source_count=15,
            artifact_types=["summary", "concept_map", "flashcards", "resources"],
        )
        complete = CompleteSummary(session_id="abc123", summary=summary)
        data = complete.model_dump()
        assert data["type"] == "complete"
        assert data["session_id"] == "abc123"

    def test_research_summary_includes_all_fields(self):
        """ResearchSummary includes topic, depth, source_count, artifact_types."""
        summary = ResearchSummary(
            topic="Machine learning",
            depth="deep",
            source_count=25,
            artifact_types=["summary", "flashcards"],
        )
        data = summary.model_dump()
        assert data["topic"] == "Machine learning"
        assert data["depth"] == "deep"
        assert data["source_count"] == 25
        assert data["artifact_types"] == ["summary", "flashcards"]

    def test_complete_summary_json_roundtrip(self):
        """CompleteSummary can serialize to JSON and deserialize back."""
        summary = ResearchSummary(
            topic="Test",
            depth="quick",
            source_count=3,
            artifact_types=["summary"],
        )
        complete = CompleteSummary(session_id="xyz789", summary=summary)
        json_str = complete.model_dump_json()
        restored = CompleteSummary.model_validate_json(json_str)
        assert restored.session_id == "xyz789"
        assert restored.summary.source_count == 3
```

---

## Implementation

File: `C:\git_repos\playground\hackathon\02-api-streaming\server\models.py`

This module defines three Pydantic models used by the API layer.

### ResearchRequest

The request body for `POST /api/research`. Two fields:

- `topic: str` -- the research topic (required)
- `depth: Literal["quick", "standard", "deep"]` -- controls pipeline depth (required, constrained to three valid values)

```python
from pydantic import BaseModel
from typing import Literal


class ResearchRequest(BaseModel):
    """POST /api/research request body."""
    topic: str
    depth: Literal["quick", "standard", "deep"]
```

FastAPI uses this model for automatic request validation. Invalid `depth` values or missing `topic` produce HTTP 422 responses automatically.

### ResearchSummary

A lightweight summary nested inside `CompleteSummary`. Contains just enough information for the frontend to display completion status without sending the full `ResearchResult` (which contains large deep-read content) over SSE.

Fields:
- `topic: str` -- the research topic
- `depth: str` -- the depth setting used
- `source_count: int` -- number of evaluated sources
- `artifact_types: list[str]` -- list of artifact keys that were generated (e.g., `["summary", "concept_map", "flashcards", "resources"]`)

```python
class ResearchSummary(BaseModel):
    """Nested summary within complete event."""
    topic: str
    depth: str
    source_count: int
    artifact_types: list[str]
```

### CompleteSummary

The SSE `complete` event payload. This is what gets sent over the wire instead of the full `CompleteEvent` from the pipeline.

Fields:
- `type: Literal["complete"]` -- always `"complete"`, matches the SSE event name
- `session_id: str` -- the UUID4 session identifier (generated by the pipeline, used for subsequent export requests)
- `summary: ResearchSummary` -- the lightweight summary

```python
class CompleteSummary(BaseModel):
    """Sent as SSE complete event data."""
    type: Literal["complete"] = "complete"
    session_id: str
    summary: ResearchSummary
```

This produces an SSE wire format like:
```
event: complete
id: 20
data: {"type": "complete", "session_id": "abc123", "summary": {"topic": "...", "depth": "standard", "source_count": 15, "artifact_types": ["summary", "concept_map", "flashcards", "resources"]}}
```

---

## How These Models Are Used (Context for Downstream Sections)

These models are consumed by later sections, summarized here for reference only:

1. **Section 05 (SSE):** `format_sse_event()` constructs a `CompleteSummary` from a pipeline `CompleteEvent` by extracting `session_id`, `topic`, `depth`, counting sources, and listing artifact keys from `CompleteEvent.result`. The `CompleteSummary` is then serialized via `model_dump_json()` as the SSE `data` field.

2. **Section 06 (Routes):** The `POST /api/research` endpoint accepts `ResearchRequest` as the request body parameter. FastAPI validates it automatically.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_models.py` | Create | Tests for ResearchRequest validation and CompleteSummary serialization |
| `C:\git_repos\playground\hackathon\02-api-streaming\server\models.py` | Create | Three Pydantic models: `ResearchRequest`, `ResearchSummary`, `CompleteSummary` |
