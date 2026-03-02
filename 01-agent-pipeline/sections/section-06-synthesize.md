# Section 06 -- Synthesize: Artifact Generation

## Overview

This section implements the synthesis module (`beacon/synthesize.py`) that takes all evaluated sources (with deep-read content for the top N) and generates four learning artifacts: an executive summary, a concept map/outline, flashcards, and a ranked resource list. The first three are produced by parallel Claude Opus calls; the fourth is assembled directly from the source data without an API call.

After completing this section you will have:

- `beacon/synthesize.py` with the `synthesize()` async function and individual artifact generators
- `tests/test_synthesize.py` with full test coverage using mocked Claude responses
- Three parallel Claude calls with proper model selection, max_tokens, and timeouts
- Shared context block builder for consistent artifact generation

## Dependencies

- **Section 01 (Foundation)**: `config.py` constants (`SYNTH_MODEL`, `SYNTH_TIMEOUT`), `conftest.py`
- **Section 02 (Models)**: `EvaluatedSource`, `IntelligenceSignals`, `Flashcard` from `beacon/models.py`; `GENERATE_SUMMARY_PROMPT`, `GENERATE_CONCEPT_MAP_PROMPT`, `GENERATE_FLASHCARDS_PROMPT`, `build_synthesis_context` from `beacon/prompts.py`

## Files to Create

```
beacon/
  synthesize.py       # Artifact generation
tests/
  test_synthesize.py  # Tests for synthesize.py
```

---

## Tests FIRST: `tests/test_synthesize.py`

```python
"""Tests for beacon.synthesize -- write these FIRST."""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from beacon.models import EvaluatedSource, IntelligenceSignals, Flashcard


def _make_source(url: str, score: int, has_content: bool = True) -> EvaluatedSource:
    """Helper: create an EvaluatedSource for testing."""
    signals = IntelligenceSignals(
        learning_efficiency_score=score,
        content_type="tutorial",
        time_estimate_minutes=10,
        recency="2025",
        key_insight=f"Insight for {url}.",
        coverage=["topic"],
    )
    return EvaluatedSource(
        url=url,
        title=f"Source at {url}",
        snippet="Original snippet.",
        signals=signals,
        deep_read_content="# Full Content\n\nDetailed article content here. " * 20 if has_content else None,
        extraction_method="tavily_extract" if has_content else None,
    )


@pytest.fixture
def sources():
    """Mix of deep-read and snippet-only sources."""
    return [
        _make_source("https://example.com/a", 9, has_content=True),
        _make_source("https://example.com/b", 7, has_content=True),
        _make_source("https://example.com/c", 5, has_content=False),
    ]


def _mock_claude_text_response(text: str) -> MagicMock:
    """Create a mock Claude response with the given text."""
    response = MagicMock()
    response.content = [MagicMock()]
    response.content[0].text = text
    return response


class TestSynthesizeMakesThreeParallelCalls:
    @pytest.mark.asyncio
    async def test_three_parallel_claude_calls(self, sources):
        """synthesize() must make exactly 3 Claude API calls (summary, concept_map, flashcards)."""
        client = AsyncMock()
        flashcards_json = json.dumps([
            {"question": "What is X?", "answer": "X is Y."},
            {"question": "What is Z?", "answer": "Z is W."},
        ])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("# Executive Summary\n\nSummary content."),
            _mock_claude_text_response("# Concept Map\n\n- Topic A\n  - Subtopic B"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "test topic", "standard", client=client)
        assert client.messages.create.call_count == 3


class TestModelSelection:
    @pytest.mark.asyncio
    async def test_all_calls_use_opus_model(self, sources):
        """All synthesis calls must use claude-opus-4-6."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        for c in client.messages.create.call_args_list:
            assert c[1]["model"] == "claude-opus-4-6"


class TestMaxTokens:
    @pytest.mark.asyncio
    async def test_summary_max_tokens_4096(self, sources):
        """Summary call must set max_tokens=4096."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        # First call is summary
        summary_call = client.messages.create.call_args_list[0]
        assert summary_call[1]["max_tokens"] == 4096

    @pytest.mark.asyncio
    async def test_concept_map_max_tokens_2048(self, sources):
        """Concept map call must set max_tokens=2048."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        concept_call = client.messages.create.call_args_list[1]
        assert concept_call[1]["max_tokens"] == 2048

    @pytest.mark.asyncio
    async def test_flashcards_max_tokens_2048(self, sources):
        """Flashcards call must set max_tokens=2048."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        fc_call = client.messages.create.call_args_list[2]
        assert fc_call[1]["max_tokens"] == 2048


class TestArtifactOutputs:
    @pytest.mark.asyncio
    async def test_summary_returns_markdown_string(self, sources):
        """Summary artifact must be a markdown string."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("# Executive Summary\n\nKey findings..."),
            _mock_claude_text_response("# Concept Map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["summary"], str)
        assert "Executive Summary" in result["summary"]

    @pytest.mark.asyncio
    async def test_concept_map_returns_markdown_string(self, sources):
        """Concept map artifact must be a markdown string."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("# Concept Map\n\n- Topic\n  - Subtopic"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["concept_map"], str)

    @pytest.mark.asyncio
    async def test_flashcards_returns_list_of_flashcard_objects(self, sources):
        """Flashcards artifact must be a list of Flashcard objects."""
        client = AsyncMock()
        flashcards_json = json.dumps([
            {"question": "What is X?", "answer": "X is Y."},
            {"question": "What is Z?", "answer": "Z is W."},
        ])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["flashcards"], list)
        assert all(isinstance(fc, Flashcard) for fc in result["flashcards"])
        assert len(result["flashcards"]) == 2


class TestResourcesArtifact:
    @pytest.mark.asyncio
    async def test_resources_assembled_without_claude_call(self, sources):
        """Resources artifact is built from source data, no Claude call needed."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert "resources" in result
        # Only 3 Claude calls, not 4 (resources doesn't need one)
        assert client.messages.create.call_count == 3

    @pytest.mark.asyncio
    async def test_resources_contains_all_sources_with_signals(self, sources):
        """Resources artifact must include all sources with their IntelligenceSignals."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        resources = result["resources"]
        assert isinstance(resources, list)
        assert len(resources) == len(sources)


class TestSynthesisContextBlock:
    @pytest.mark.asyncio
    async def test_context_includes_deep_read_and_snippet_sources(self, sources):
        """The shared context block must include deep-read content and snippet-only sources."""
        from beacon.prompts import build_synthesis_context
        context = build_synthesis_context("test topic", "standard", sources)
        # Deep-read sources should have their content
        assert "Full Content" in context
        # Snippet-only source should be marked
        assert "snippet" in context.lower()
        # All source URLs should appear
        for s in sources:
            assert s.url in context


class TestPartialFailure:
    @pytest.mark.asyncio
    async def test_one_artifact_failure_does_not_block_others(self, sources):
        """If one synthesis call fails, the other artifacts should still be returned."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            Exception("Summary generation failed"),
            _mock_claude_text_response("# Concept Map\n\nContent."),
            _mock_claude_text_response(flashcards_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        # Summary failed but concept_map and flashcards should be present
        assert result.get("concept_map") is not None
        assert result.get("flashcards") is not None
        # Summary should be an error string or None
        assert result.get("summary") is None or "failed" in str(result.get("summary", "")).lower() or result.get("summary") == ""
```

---

## Implementation: `beacon/synthesize.py`

### Main function signature

```python
async def synthesize(
    sources: list[EvaluatedSource],
    topic: str,
    depth: str,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Generate learning artifacts from evaluated sources.

    Makes 3 parallel Claude Opus calls for summary, concept_map, and flashcards.
    Assembles a 4th artifact (resources) directly from the source data.

    Args:
        sources: All evaluated sources (some with deep_read_content, some snippet-only).
        topic: The research topic.
        depth: The depth setting (for context in prompts).
        client: Optional AsyncAnthropic client (dependency injection for tests).

    Returns:
        Dict with keys: 'summary', 'concept_map', 'flashcards', 'resources'.
        - summary: str (markdown)
        - concept_map: str (markdown outline)
        - flashcards: list[Flashcard]
        - resources: list[dict] (serialized EvaluatedSource objects)
        If a Claude call fails, the corresponding value may be None or an error string.
    """
```

### Individual artifact generators

```python
async def _generate_summary(
    context: str, client: AsyncAnthropic
) -> str:
    """Generate executive summary. max_tokens=4096, timeout=120s."""

async def _generate_concept_map(
    context: str, client: AsyncAnthropic
) -> str:
    """Generate concept map/outline. max_tokens=2048, timeout=120s."""

async def _generate_flashcards(
    context: str, client: AsyncAnthropic
) -> list[Flashcard]:
    """Generate flashcards. max_tokens=2048, timeout=120s.
    Parses JSON array from Claude response, validates each as Flashcard."""
```

### Key implementation details

**Claude API call structure** (same pattern for all three):
```python
response = await asyncio.wait_for(
    client.messages.create(
        model="claude-opus-4-6",   # from config.SYNTH_MODEL
        max_tokens=4096,            # varies per artifact
        messages=[{"role": "user", "content": prompt_with_context}],
    ),
    timeout=120,  # from config.SYNTH_TIMEOUT
)
text = response.content[0].text
```

**Parallel execution**:
```python
# Build shared context once
context = build_synthesis_context(topic, depth, sources)

# Launch three calls in parallel
summary_task = _generate_summary(context, client)
concept_task = _generate_concept_map(context, client)
flashcards_task = _generate_flashcards(context, client)

results = await asyncio.gather(
    summary_task, concept_task, flashcards_task,
    return_exceptions=True,
)

# Process results, handling exceptions
summary = results[0] if not isinstance(results[0], Exception) else None
concept_map = results[1] if not isinstance(results[1], Exception) else None
flashcards = results[2] if not isinstance(results[2], Exception) else []
```

**Flashcard parsing**: The flashcards prompt instructs Claude to output a JSON array. Parse with `json.loads()`, then validate each item as `Flashcard(**item)`. If parsing fails, return an empty list.

**Resources artifact**: Assembled directly without a Claude call:
```python
resources = [source.model_dump() for source in sources]
```

This serializes each `EvaluatedSource` (including its `IntelligenceSignals`) into a dict suitable for the SSE stream.

**Prompt construction**: Each artifact generator prepends its specific prompt template to the shared context block:
```python
prompt = GENERATE_SUMMARY_PROMPT + "\n\n" + context
```

The shared context block is built by `build_synthesis_context()` from `prompts.py` (implemented in Section 02).

---

## Verification Steps

```bash
uv run pytest tests/test_synthesize.py -v
```

All tests should pass. Additionally verify:

1. `from beacon.synthesize import synthesize` imports cleanly
2. Exactly 3 Claude API calls are made (not 4)
3. All calls use `claude-opus-4-6`
4. A failed synthesis call does not prevent other artifacts from being generated
5. The resources artifact contains all sources with their signals

---

## Design Decisions

- **Opus for synthesis**: All synthesis calls use `claude-opus-4-6` because these are user-facing artifacts where quality matters more than cost or latency.
- **Parallel with gather + return_exceptions=True**: Using `return_exceptions=True` ensures that if one artifact fails, the others still complete. Each result is checked for `isinstance(result, Exception)`.
- **120-second timeout**: Synthesis prompts can be large (all source content) and require complex generation. 120 seconds is generous but prevents indefinite hangs.
- **Shared context block**: Built once by `build_synthesis_context()` and reused across all three prompts. This ensures consistent treatment of sources and avoids building the same string three times.
- **Resources as serialized dicts**: The resources artifact is a list of dicts (from `model_dump()`) rather than a string. This allows the SSE layer to forward structured data to the frontend for rendering as cards/tables.
- **Flashcard JSON parsing with fallback**: If Claude's flashcard output is malformed JSON, the function returns an empty list rather than crashing. The pipeline can still deliver summary and concept map artifacts.
