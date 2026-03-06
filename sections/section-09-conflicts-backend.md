# Section 9: Conflict Detection + Assumption Surfacing -- Backend

## Overview

This section adds two new parallel artifact generators to the Beacon synthesis pipeline: **conflict detection** (identifying disagreements between sources) and **assumption surfacing** (finding hidden premises in the research). Both produce structured JSON arrays emitted as new artifact types alongside existing artifacts.

After this section, the pipeline will make 6 parallel Claude API calls during synthesis (up from 3 originally, 4 with timeline), and the `ArtifactEvent.artifact_type` Literal will accept `"timeline"`, `"conflicts"`, and `"assumptions"` in addition to the original types.

## Dependencies

- **Section 7 (Timeline Backend):** Adds `_generate_timeline()` to the same `asyncio.gather()` and updates the `ArtifactEvent.artifact_type` Literal. If Section 7 is implemented first, extend from 4 to 6 generators. If not, extend from 3 to 5.
- No frontend dependencies -- Section 10 consumes these artifacts.

## Files to Modify

1. `01-agent-pipeline/beacon/prompts.py` -- Add two new prompt constants
2. `01-agent-pipeline/beacon/synthesize.py` -- Add two generator functions, expand `asyncio.gather()`
3. `01-agent-pipeline/beacon/models.py` -- Extend `ArtifactEvent.artifact_type` Literal

## Test Files

1. `01-agent-pipeline/tests/test_synthesize.py` -- Add new test classes
2. `01-agent-pipeline/tests/test_models.py` -- Add tests for new artifact_type values

---

## Tests (Write First)

### Synthesis Tests -- `01-agent-pipeline/tests/test_synthesize.py`

```python
class TestGenerateConflicts:
    # Test: _generate_conflicts returns list of conflict dicts
    # Test: _generate_conflicts strips code fences and parses JSON
    # Test: _generate_conflicts returns empty list on malformed response

class TestGenerateAssumptions:
    # Test: _generate_assumptions returns list of assumption dicts
    # Test: _generate_assumptions strips code fences and parses JSON
    # Test: _generate_assumptions returns empty list on malformed response

class TestSynthesizeIncludesConflictsAndAssumptions:
    # Test: synthesize() includes conflicts and assumptions in artifacts dict
    # Test: synthesize() runs all 6 generators in parallel (call_count == 6)
```

**Important:** Existing tests with `side_effect` lists of 3 responses must be extended to include responses for new generators (conflicts, assumptions, and timeline if Section 7 present).

### Model Tests -- `01-agent-pipeline/tests/test_models.py`

```python
# Test: ArtifactEvent accepts artifact_type="conflicts"
# Test: ArtifactEvent accepts artifact_type="assumptions"
# Test: ArtifactEvent accepts artifact_type="timeline" (if not already from Section 7)
```

---

## Implementation Details

### 1. Model Update -- `models.py`

Extend `ArtifactEvent.artifact_type` Literal:

```python
artifact_type: Literal["summary", "concept_map", "flashcards", "resources", "timeline", "conflicts", "assumptions"]
```

### 2. Prompt Additions -- `prompts.py`

**`GENERATE_CONFLICTS_PROMPT`:**
- Identify 2-5 disagreements between sources
- Output JSON: `[{"topic", "source_a": {"title", "claim"}, "source_b": {"title", "claim"}, "assessment"}]`
- If no conflicts: return `[]`
- Uses `{context}` placeholder
- Respond with ONLY JSON, no fences

**`GENERATE_ASSUMPTIONS_PROMPT`:**
- Identify 3-5 hidden assumptions
- Output JSON: `[{"assumption", "why_it_matters", "sources_relying": ["title1"], "risk_level": "high"|"medium"|"low"}]`
- Focus on assumptions that could invalidate conclusions
- If no notable assumptions: return `[]`
- Uses `{context}` placeholder
- Respond with ONLY JSON, no fences

### 3. Synthesis Integration -- `synthesize.py`

**New function: `_generate_conflicts(context, client)`**
- Same pattern as `_generate_flashcards`
- `SYNTH_MODEL`, `max_tokens=2048`, `SYNTH_TIMEOUT`
- Strip fences, parse JSON, return `list[dict]` or `[]` on failure

**New function: `_generate_assumptions(context, client)`**
- Identical pattern using `GENERATE_ASSUMPTIONS_PROMPT`

**Update `asyncio.gather()`:**

```python
results = await asyncio.gather(
    _generate_summary(context, client),
    _generate_concept_map(context, client),
    _generate_flashcards(context, client),
    _generate_timeline(context, client),      # Section 7
    _generate_conflicts(context, client),     # This section
    _generate_assumptions(context, client),   # This section
    return_exceptions=True,
)
```

Handle results with same failure pattern:
```python
conflicts = results[4] if not isinstance(results[4], Exception) else []
assumptions = results[5] if not isinstance(results[5], Exception) else []
```

Add to return dict: `"conflicts": conflicts, "assumptions": assumptions`

### 4. Pipeline -- `pipeline.py`

No changes needed. Existing serialization handles `list[dict]` via `json.dumps(data, default=str)`.

---

## Existing Test Updates

Extend all existing test `side_effect` lists. Add responses for conflicts and assumptions:

```python
_mock_claude_text_response("[]"),  # conflicts
_mock_claude_text_response("[]"),  # assumptions
```

Update call count assertions (3 → 6 if timeline present, 3 → 5 if not).

---

## JSON Output Shapes

### Conflicts
```json
[{
  "topic": "Effectiveness of X",
  "source_a": {"title": "Paper A", "claim": "X improves by 40%"},
  "source_b": {"title": "Report B", "claim": "No significant improvement"},
  "assessment": "Different methodologies explain the discrepancy"
}]
```

### Assumptions
```json
[{
  "assumption": "Hardware trends continue at same pace",
  "why_it_matters": "Feasibility depends on continued scaling",
  "sources_relying": ["Tech Roadmap", "Industry Analysis"],
  "risk_level": "medium"
}]
```

---

## Verification

```bash
cd 01-agent-pipeline
uv run pytest tests/test_synthesize.py tests/test_models.py -v
```

---

## Implementation Notes

### What Was Actually Built
Implementation matched the plan exactly with no deviations.

### Files Modified
1. `01-agent-pipeline/beacon/prompts.py` — Added `GENERATE_CONFLICTS_PROMPT` and `GENERATE_ASSUMPTIONS_PROMPT`
2. `01-agent-pipeline/beacon/synthesize.py` — Added `_generate_conflicts()` and `_generate_assumptions()`, expanded `asyncio.gather()` from 4 to 6 calls, added result handling and logging
3. `01-agent-pipeline/beacon/models.py` — Already had `"conflicts"` and `"assumptions"` in Literal (from prior section)
4. `01-agent-pipeline/tests/test_synthesize.py` — Added 9 new tests (3 per generator + 3 integration), updated 17 existing tests' side_effects from 4 to 6 mock responses
5. `01-agent-pipeline/tests/test_models.py` — Already had tests for new artifact types (from prior section)

### Test Results
- 56 tests pass (44 existing + 9 new + 3 model tests already present)
- All existing tests updated to expect 6 parallel calls

### Code Review
- Verdict: PASS (high confidence)
- No issues found, two informational observations (DRY opportunity, unvalidated dicts) — both consistent with existing patterns
