# Section 7: Timeline — Backend Artifact Generation

## Overview

This section adds a new pipeline artifact that extracts temporal events from research sources and emits them as structured JSON. It follows the exact same pattern as existing artifact generators (`_generate_summary`, `_generate_concept_map`, `_generate_flashcards`) in `synthesize.py`, adding a `GENERATE_TIMELINE_PROMPT` to `prompts.py` and updating the `ArtifactEvent` model to accept the new artifact types.

This section has no dependencies on other sections and blocks section-08 (Timeline Frontend Display).

---

## Files to Modify

| File | Action |
|------|--------|
| `01-agent-pipeline/beacon/prompts.py` | Add `GENERATE_TIMELINE_PROMPT` constant |
| `01-agent-pipeline/beacon/synthesize.py` | Add `_generate_timeline()` function, update `synthesize()` to include it in parallel gather |
| `01-agent-pipeline/beacon/models.py` | Expand `ArtifactEvent.artifact_type` Literal to include `"timeline"`, `"conflicts"`, `"assumptions"` |
| `01-agent-pipeline/tests/test_synthesize.py` | Add timeline-specific tests |
| `01-agent-pipeline/tests/test_models.py` | Add tests for new artifact_type values |

---

## Tests (Write First)

All tests use the existing testing infrastructure: `pytest` with `pytest-asyncio` (asyncio_mode="auto"), `unittest.mock.AsyncMock` / `MagicMock` for mocking the Anthropic client.

### Model Tests — `01-agent-pipeline/tests/test_models.py`

Add tests to verify the `ArtifactEvent` model accepts the three new artifact type values:

```
# Test: ArtifactEvent accepts artifact_type="timeline"
# Test: ArtifactEvent accepts artifact_type="conflicts"
# Test: ArtifactEvent accepts artifact_type="assumptions"
```

### Synthesis Tests — `01-agent-pipeline/tests/test_synthesize.py`

Add a new test class `TestTimelineGeneration`.

**Important:** After adding `_generate_timeline`, the `synthesize()` function makes 4 parallel Claude API calls instead of 3. All existing tests that mock `client.messages.create` with `side_effect` lists of exactly 3 responses will need an additional 4th response added to their side_effect lists, or they will raise `StopIteration`.

```
# Test: _generate_timeline returns list of timeline event dicts
#   Mock client to return valid JSON array of timeline events
#   Assert result is a list with expected keys

# Test: _generate_timeline strips markdown code fences before JSON parsing
#   Mock client to return: '```json\n[{"date": "2024-01", ...}]\n```'
#   Assert returns valid list

# Test: _generate_timeline returns empty list on malformed JSON
#   Mock client to return prose text
#   Assert returns []

# Test: _generate_timeline returns empty list on non-JSON response
#   Mock client to return: "No temporal events found"
#   Assert returns []

# Test: synthesize() includes timeline in returned artifacts dict
#   Mock client with 4 responses. Assert "timeline" in result

# Test: synthesize() runs timeline generation in parallel with existing generators
#   Mock client with 4 responses. Assert call_count == 4 (was 3)
```

---

## Implementation Details

### 1. Prompt Addition — `prompts.py`

Add `GENERATE_TIMELINE_PROMPT` after existing `GENERATE_FLASHCARDS_PROMPT`:

- Instruct LLM to extract 5-15 temporal events from sources
- Output format: JSON array with fields: `date` (string), `title`, `description` (1-2 sentences), `source_title`, `significance` ("high"|"medium"|"low")
- Sorted chronologically
- Include milestones, releases, breakthroughs, shifts in thinking
- If no meaningful temporal dimension, return empty array `[]`
- Do NOT wrap in markdown code fences
- Uses `{context}` placeholder

### 2. Model Update — `models.py`

Update the `ArtifactEvent` class. Change `artifact_type` field Literal from:

```python
artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
```

to:

```python
artifact_type: Literal["summary", "concept_map", "flashcards", "resources", "timeline", "conflicts", "assumptions"]
```

The `"conflicts"` and `"assumptions"` values are included now even though generators are added in Section 9 — avoids modifying the same Literal twice.

### 3. Synthesis Function — `synthesize.py`

Add `_generate_timeline()` following the exact pattern of `_generate_flashcards()`:

**Import** `GENERATE_TIMELINE_PROMPT` from `beacon.prompts`.

**Function:**

```python
async def _generate_timeline(context: str, client: AsyncAnthropic) -> list[dict]:
    """Generate timeline events. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
```

Implementation:
1. Replace `{context}` in `GENERATE_TIMELINE_PROMPT`
2. Call `client.messages.create()` with `model=SYNTH_MODEL`, `max_tokens=2048`, wrapped in `asyncio.wait_for(..., timeout=SYNTH_TIMEOUT)`
3. Strip whitespace, strip code fences (same regex as flashcards)
4. Apply fallback extraction: if text doesn't start with `[`, search for `\[.*\]` with `re.DOTALL`
5. `json.loads()` — if not a list, return `[]`
6. On parse exception, return `[]`

**Update `synthesize()` function:**

Add as 4th call in `asyncio.gather()`:

```python
results = await asyncio.gather(
    _generate_summary(context, client),
    _generate_concept_map(context, client),
    _generate_flashcards(context, client),
    _generate_timeline(context, client),
    return_exceptions=True,
)
```

Handle 4th result with same failure pattern:

```python
timeline = results[3] if not isinstance(results[3], Exception) else []
```

Add `"timeline": timeline` to returned dict.

### 4. Pipeline Integration — `pipeline.py`

No changes needed. The artifact event emission loop already handles lists generically via `json.dumps(data, default=str)`.

---

## Existing Test Updates

When `synthesize()` goes from 3 to 4 parallel calls, all existing test `side_effect` lists need a 4th entry. Add:

```python
_mock_claude_text_response(json.dumps([]))  # empty timeline
```

Tests to update:
- `TestSynthesizeMakesThreeParallelCalls` (rename, change `call_count` assertion from 3 to 4)
- `TestModelSelection`
- `TestMaxTokens`
- `TestArtifactOutputs`
- `TestResourcesArtifact`
- `TestPartialFailure`
- `TestFlashcardFenceStripping`

---

## Implementation Notes

**Deviations from plan:**
- Added example JSON output in `GENERATE_TIMELINE_PROMPT` (code review recommendation, matches pattern in `GENERATE_FLASHCARDS_PROMPT`)
- `TestSynthesizeMakesThreeParallelCalls` renamed to `TestSynthesizeMakesFourParallelCalls`
- Added `test_timeline_max_tokens_2048` test to `TestMaxTokens` class
- `TestResourcesArtifact.test_resources_assembled_without_claude_call` renamed to `test_resources_assembled_without_extra_claude_call` and updated assertion from `call_count == 3` to `call_count == 4`

**Final test count:** 47 tests (23 model + 24 synthesis), all passing

---

## Verification

After implementation, run:

```bash
cd 01-agent-pipeline
uv run pytest tests/test_synthesize.py tests/test_models.py -v
```
