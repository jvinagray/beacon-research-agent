# Section 02 -- Data Models and Prompt Templates

## Overview

This section defines all Pydantic data models and pipeline event types used throughout the Beacon pipeline, plus the Claude prompt templates stored in `prompts.py`. These types form the shared vocabulary of the entire system -- every other module imports from `models.py`.

After completing this section you will have:

- All core data models: `Source`, `IntelligenceSignals`, `EvaluatedSource`, `Flashcard`, `ResearchResult`
- All pipeline event types: `StatusEvent`, `SourcesFoundEvent`, `SourceEvaluatedEvent`, `ArtifactEvent`, `ErrorEvent`, `CompleteEvent`
- The `PipelineEvent` union type
- All Claude prompt templates in `prompts.py`
- Tests validating model constraints, serialization, and prompt content

## Dependencies

- **Section 01 (Foundation)** must be complete: `pyproject.toml`, `beacon/__init__.py`, and `tests/conftest.py` must exist.

## Files to Create

```
beacon/
  models.py     # All Pydantic data models and event types
  prompts.py    # All Claude prompt templates
tests/
  test_models.py   # Tests for models.py
  test_prompts.py  # Tests for prompts.py
```

---

## Tests FIRST: `tests/test_models.py`

```python
"""Tests for beacon.models -- write these FIRST."""
import json
import pytest
from beacon.models import (
    Source,
    IntelligenceSignals,
    EvaluatedSource,
    Flashcard,
    ResearchResult,
    StatusEvent,
    SourcesFoundEvent,
    SourceEvaluatedEvent,
    ArtifactEvent,
    ErrorEvent,
    CompleteEvent,
)


class TestSource:
    def test_source_accepts_valid_data(self):
        src = Source(url="https://example.com", title="Example", snippet="A snippet.")
        assert src.url == "https://example.com"
        assert src.title == "Example"
        assert src.snippet == "A snippet."


class TestIntelligenceSignals:
    def test_valid_signals(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=8,
            content_type="tutorial",
            time_estimate_minutes=15,
            recency="2025",
            key_insight="Great tutorial.",
            coverage=["basics", "advanced"],
        )
        assert signals.learning_efficiency_score == 8
        assert signals.evaluation_failed is False

    def test_score_minimum_boundary(self):
        """Score of 0 is allowed (used for failed evaluations)."""
        signals = IntelligenceSignals(
            learning_efficiency_score=0,
            content_type="other",
            time_estimate_minutes=0,
            recency=None,
            key_insight="Evaluation failed",
            coverage=[],
            evaluation_failed=True,
        )
        assert signals.learning_efficiency_score == 0

    def test_score_maximum_boundary(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=10,
            content_type="tutorial",
            time_estimate_minutes=5,
            recency=None,
            key_insight="Perfect.",
            coverage=["all"],
        )
        assert signals.learning_efficiency_score == 10

    def test_all_valid_content_types(self):
        valid_types = [
            "tutorial", "paper", "docs", "opinion", "video",
            "forum", "repository", "course", "other",
        ]
        for ct in valid_types:
            signals = IntelligenceSignals(
                learning_efficiency_score=5,
                content_type=ct,
                time_estimate_minutes=10,
                recency=None,
                key_insight="Test.",
                coverage=[],
            )
            assert signals.content_type == ct

    def test_evaluation_failed_defaults_to_false(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=5,
            content_type="docs",
            time_estimate_minutes=10,
            recency=None,
            key_insight="Test.",
            coverage=[],
        )
        assert signals.evaluation_failed is False


class TestEvaluatedSource:
    def test_optional_fields_default_to_none(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=7,
            content_type="tutorial",
            time_estimate_minutes=10,
            recency=None,
            key_insight="Good.",
            coverage=["topic"],
        )
        src = EvaluatedSource(
            url="https://example.com",
            title="Example",
            snippet="Snippet.",
            signals=signals,
            deep_read_content=None,
            extraction_method=None,
        )
        assert src.deep_read_content is None
        assert src.extraction_method is None


class TestFlashcard:
    def test_flashcard_requires_both_fields(self):
        fc = Flashcard(question="What is X?", answer="X is Y.")
        assert fc.question == "What is X?"
        assert fc.answer == "X is Y."

    def test_flashcard_rejects_missing_question(self):
        with pytest.raises(Exception):
            Flashcard(answer="Answer only.")

    def test_flashcard_rejects_missing_answer(self):
        with pytest.raises(Exception):
            Flashcard(question="Question only.")


class TestResearchResult:
    def test_research_result_accepts_valid_data(self):
        result = ResearchResult(
            topic="AI agents",
            depth="standard",
            sources=[],
            artifacts={"summary": "text", "concept_map": "text", "flashcards": [], "resources": []},
            session_id="abc-123",
            timestamp="2025-01-01T00:00:00Z",
        )
        assert result.topic == "AI agents"
        assert result.depth == "standard"
        assert isinstance(result.session_id, str)
        assert isinstance(result.timestamp, str)

    def test_artifacts_field_accepts_dict(self):
        result = ResearchResult(
            topic="test",
            depth="quick",
            sources=[],
            artifacts={"summary": "s", "concept_map": "c", "flashcards": [], "resources": []},
            session_id="id",
            timestamp="ts",
        )
        assert "summary" in result.artifacts


class TestPipelineEvents:
    def test_status_event_type_discriminator(self):
        evt = StatusEvent(message="Searching...")
        data = evt.model_dump()
        assert data["type"] == "status"

    def test_sources_found_event_type(self):
        evt = SourcesFoundEvent(count=3, sources=[])
        data = evt.model_dump()
        assert data["type"] == "sources_found"

    def test_source_evaluated_event_type(self):
        from beacon.models import IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=7, content_type="docs",
            time_estimate_minutes=10, recency=None,
            key_insight="Good.", coverage=["x"],
        )
        src = EvaluatedSource(
            url="https://example.com", title="T", snippet="S",
            signals=signals, deep_read_content=None, extraction_method=None,
        )
        evt = SourceEvaluatedEvent(index=0, total=5, source=src)
        data = evt.model_dump()
        assert data["type"] == "source_evaluated"

    def test_artifact_event_type(self):
        evt = ArtifactEvent(artifact_type="summary", data="Summary text.")
        data = evt.model_dump()
        assert data["type"] == "artifact"

    def test_artifact_event_supports_resources_type(self):
        evt = ArtifactEvent(artifact_type="resources", data="[]")
        assert evt.artifact_type == "resources"

    def test_error_event_type(self):
        evt = ErrorEvent(message="Something failed.", recoverable=True)
        data = evt.model_dump()
        assert data["type"] == "error"

    def test_complete_event_type(self):
        result = ResearchResult(
            topic="t", depth="quick", sources=[], artifacts={},
            session_id="id", timestamp="ts",
        )
        evt = CompleteEvent(session_id="id", result=result)
        data = evt.model_dump()
        assert data["type"] == "complete"

    def test_all_events_serialize_to_json(self):
        """Every event type must be JSON-serializable."""
        events = [
            StatusEvent(message="test"),
            SourcesFoundEvent(count=0, sources=[]),
            ArtifactEvent(artifact_type="summary", data="text"),
            ErrorEvent(message="err", recoverable=False),
        ]
        for evt in events:
            json_str = evt.model_dump_json()
            parsed = json.loads(json_str)
            assert "type" in parsed
```

---

## Tests FIRST: `tests/test_prompts.py`

```python
"""Tests for beacon.prompts -- write these FIRST."""
from beacon.prompts import (
    EVALUATE_SOURCE_PROMPT,
    GENERATE_SUMMARY_PROMPT,
    GENERATE_CONCEPT_MAP_PROMPT,
    GENERATE_FLASHCARDS_PROMPT,
    build_evaluate_prompt,
    build_synthesis_context,
)


class TestPromptConstants:
    def test_evaluate_prompt_is_nonempty(self):
        assert len(EVALUATE_SOURCE_PROMPT) > 0

    def test_evaluate_prompt_contains_scoring_rubric(self):
        assert "9-10" in EVALUATE_SOURCE_PROMPT or "scoring" in EVALUATE_SOURCE_PROMPT.lower()

    def test_evaluate_prompt_contains_fewshot_example(self):
        assert "example" in EVALUATE_SOURCE_PROMPT.lower() or "learning_efficiency_score" in EVALUATE_SOURCE_PROMPT

    def test_summary_prompt_is_nonempty(self):
        assert len(GENERATE_SUMMARY_PROMPT) > 0

    def test_concept_map_prompt_is_nonempty(self):
        assert len(GENERATE_CONCEPT_MAP_PROMPT) > 0

    def test_flashcards_prompt_is_nonempty(self):
        assert len(GENERATE_FLASHCARDS_PROMPT) > 0


class TestPromptFunctions:
    def test_build_evaluate_prompt_includes_source_data(self):
        prompt = build_evaluate_prompt(
            topic="machine learning",
            url="https://example.com/ml",
            title="ML Tutorial",
            snippet="A great ML tutorial.",
        )
        assert "machine learning" in prompt
        assert "https://example.com/ml" in prompt
        assert "ML Tutorial" in prompt
        assert "A great ML tutorial." in prompt

    def test_build_synthesis_context_includes_deep_read(self):
        from beacon.models import EvaluatedSource, IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=8, content_type="tutorial",
            time_estimate_minutes=10, recency=None,
            key_insight="Great.", coverage=["topic"],
        )
        sources = [EvaluatedSource(
            url="https://example.com", title="Test", snippet="Snippet.",
            signals=signals, deep_read_content="# Full Content\n\nDetails here.",
            extraction_method="tavily_extract",
        )]
        context = build_synthesis_context("test topic", "standard", sources)
        assert "test topic" in context
        assert "# Full Content" in context
        assert "https://example.com" in context
```

---

## Implementation: `beacon/models.py`

All models use Pydantic `BaseModel`. Key design points:

### Core Data Models

```python
from pydantic import BaseModel
from typing import Literal, Any


class Source(BaseModel):
    """Raw search result from Tavily."""
    url: str
    title: str
    snippet: str


class IntelligenceSignals(BaseModel):
    """Claude's evaluation of a source's learning value."""
    learning_efficiency_score: int       # 0-10 (0 = failed evaluation)
    content_type: Literal[
        "tutorial", "paper", "docs", "opinion", "video",
        "forum", "repository", "course", "other"
    ]
    time_estimate_minutes: int
    recency: str | None
    key_insight: str                     # 1-2 sentences
    coverage: list[str]                  # subtopics this source addresses
    evaluation_failed: bool = False      # True if evaluation call failed


class EvaluatedSource(BaseModel):
    """Source with intelligence signals and optional deep-read content."""
    url: str
    title: str
    snippet: str
    signals: IntelligenceSignals
    deep_read_content: str | None = None
    extraction_method: str | None = None


class Flashcard(BaseModel):
    """A single question/answer pair for study."""
    question: str
    answer: str


class ResearchResult(BaseModel):
    """Complete output of a research run."""
    topic: str
    depth: str
    sources: list[EvaluatedSource]
    artifacts: dict[str, Any]
    session_id: str
    timestamp: str
```

### Pipeline Event Types

Each event has a `type` field with a `Literal` default so JSON serialization always includes the discriminator.

```python
class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    message: str

class SourcesFoundEvent(BaseModel):
    type: Literal["sources_found"] = "sources_found"
    count: int
    sources: list[Source]

class SourceEvaluatedEvent(BaseModel):
    type: Literal["source_evaluated"] = "source_evaluated"
    index: int
    total: int
    source: EvaluatedSource

class ArtifactEvent(BaseModel):
    type: Literal["artifact"] = "artifact"
    artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
    data: str | list[Flashcard]

class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str
    recoverable: bool

class CompleteEvent(BaseModel):
    type: Literal["complete"] = "complete"
    session_id: str
    result: ResearchResult

PipelineEvent = StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent
```

---

## Implementation: `beacon/prompts.py`

This module contains all Claude prompt templates as string constants, plus helper functions that format prompts with runtime data.

### Constants to define

**`EVALUATE_SOURCE_PROMPT`** -- Template string for evaluating a single source. Must include:
- Role instruction: "You are a research source evaluator..."
- The scoring rubric (9-10: comprehensive/on-topic, 7-8: good coverage, 5-6: partial, 3-4: tangential, 1-2: off-topic)
- Output format specification: respond with a single JSON object matching the `IntelligenceSignals` schema
- A few-shot example showing a scored source with all fields
- Fields to output: `learning_efficiency_score`, `content_type`, `time_estimate_minutes`, `recency`, `key_insight`, `coverage`

**`GENERATE_SUMMARY_PROMPT`** -- Template for executive summary generation. Instructs Claude to:
- Synthesize across all provided sources (not summarize each individually)
- Highlight consensus and disagreements between sources
- Structure with clear markdown headings
- Output 1-2 pages of markdown

**`GENERATE_CONCEPT_MAP_PROMPT`** -- Template for concept map/outline. Instructs Claude to:
- Organize by concept hierarchy, not by source
- Use indented markdown outline format
- Show relationships and prerequisites between concepts

**`GENERATE_FLASHCARDS_PROMPT`** -- Template for flashcard generation. Instructs Claude to:
- Extract 10-20 key facts/concepts as testable Q&A pairs
- Output a JSON array of `{"question": "...", "answer": "..."}` objects
- Focus on factual, verifiable content

### Functions to define

**`build_evaluate_prompt(topic: str, url: str, title: str, snippet: str) -> str`**

Takes the research topic and a single source's metadata. Returns the fully formatted evaluation prompt by inserting the source data into `EVALUATE_SOURCE_PROMPT`.

**`build_synthesis_context(topic: str, depth: str, sources: list[EvaluatedSource]) -> str`**

Builds the shared context block used by all three synthesis prompts. For each source:
- If `deep_read_content` is not None: include title, URL, score, key insight, and the full content
- If `deep_read_content` is None: include title, URL, score, key insight, and the snippet (marked as "snippet only")

This context block is assembled once and prepended to each synthesis prompt.

---

## Verification Steps

```bash
uv run pytest tests/test_models.py tests/test_prompts.py -v
```

All tests should pass. Verify:

1. All model classes can be imported: `from beacon.models import Source, IntelligenceSignals, EvaluatedSource, Flashcard, ResearchResult`
2. All event types can be imported and serialized to JSON
3. `PipelineEvent` is a union type that type checkers can use
4. All prompt constants are non-empty strings
5. `build_evaluate_prompt()` and `build_synthesis_context()` return formatted strings containing the input data

---

## Design Decisions

- **`learning_efficiency_score` allows 0**: The plan specifies 1-10 for valid scores, but failed evaluations use score=0 as a sentinel value. The model allows 0-10 to accommodate this.
- **`PipelineEvent` as a Union**: Uses Python 3.10+ union syntax (`X | Y | Z`). This enables type-safe event handling in consumers.
- **`ArtifactEvent.data` is `str | list[Flashcard]`**: Summary and concept map are strings; flashcards are a list. The union type handles both cases.
- **Prompts in a separate module**: Keeps prompt engineering separate from business logic. Prompts can be tested and iterated independently.
- **`build_synthesis_context` as a shared function**: All three synthesis prompts need the same source context block. Building it once avoids duplication and ensures consistency.

---

## Implementation Notes (Post-Build)

### Deviations from Plan
1. **learning_efficiency_score validation**: Added `Field(ge=0, le=10)` per code review to enforce valid range at model level. Plan showed plain `int`.
2. **Docstrings**: Added docstrings to all model classes as plan examples showed them.
3. **EVALUATE_SOURCE_PROMPT JSON example**: Required double-brace escaping (`{{...}}`) because `build_evaluate_prompt` uses `.format()` which conflicts with literal JSON braces.

### Test Results
- 28/28 tests passing (20 model tests + 8 prompt tests)
- All files created as specified
