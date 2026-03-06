# Section 01: Fix Flashcard Generation

## Overview

Flashcard generation silently fails because Claude wraps JSON responses in markdown code fences (` ```json ... ``` `), and the parser doesn't reliably strip them. This section fixes the issue at three levels: prompt hardening, robust backend regex stripping, a frontend safety net, and a developer-experience improvement (hot-reload for pipeline changes).

This section touches all three project layers but is self-contained with no dependencies on other sections.

---

## Architecture Context

- **`01-agent-pipeline/beacon/prompts.py`** contains `GENERATE_FLASHCARDS_PROMPT` which instructs Claude to "Respond with ONLY the JSON array" but does NOT explicitly prohibit code fences.
- **`01-agent-pipeline/beacon/synthesize.py`** has `_generate_flashcards()` (lines 49-76) which attempts line-based fence stripping: checks if first line starts with ` ``` `, then removes first and last lines. This fails with leading/trailing whitespace, trailing whitespace on fences, or plain ` ``` ` without `json`.
- **`03-frontend-dashboard/src/lib/artifacts.ts`** has `normalizeArtifact()` which handles flashcard parsing. Currently no fence stripping — just `JSON.parse()`.
- **`02-api-streaming/server/__main__.py`** runs uvicorn with `reload=True` but no `reload_dirs`, so only `02-api-streaming/` is watched. Pipeline changes require manual restart.
- When `json.loads()` fails in the backend, the function logs a warning and returns `[]`. The frontend displays "No flashcards were generated."

---

## Tests (Write First)

### Backend Fence Stripping Tests

**File: `01-agent-pipeline/tests/test_synthesize.py`** (add to existing or create new test class)

```python
# Test: _generate_flashcards strips ```json fenced response and parses flashcards
# - Mock the Anthropic client to return a response wrapped in ```json\n[...]\n```
# - Call _generate_flashcards with mocked client
# - Assert the returned list contains the expected flashcard dicts

# Test: _generate_flashcards strips plain ``` fenced response (no language tag)
# - Mock response wrapped in ```\n[...]\n```
# - Assert parsing succeeds and returns expected flashcards

# Test: _generate_flashcards handles response with leading/trailing whitespace around fences
# - Mock response with whitespace: "  ```json \n[...]\n ```  "
# - Assert parsing still succeeds

# Test: _generate_flashcards still works with clean unfenced JSON
# - Mock response with clean JSON array (no fences)
# - Assert parsing succeeds

# Test: _generate_flashcards returns [] for completely invalid JSON (not fixable by stripping)
# - Mock response with garbage text
# - Assert returns empty list
```

### Frontend Fence Stripping Tests

**File: `03-frontend-dashboard/src/lib/__tests__/artifacts.test.ts`** (create new)

```typescript
// Test: normalizeArtifact('flashcards', '```json\n[{"question":"Q","answer":"A"}]\n```') returns parsed array
// - Call normalizeArtifact with fenced JSON string
// - Assert returns array with one flashcard object

// Test: normalizeArtifact('flashcards', '```\n[{"question":"Q","answer":"A"}]\n```') strips plain fences
// - Call with plain ``` fences (no language tag)
// - Assert returns parsed array

// Test: normalizeArtifact('flashcards', '[{"question":"Q","answer":"A"}]') still works for clean JSON
// - Call with clean JSON string (no fences)
// - Assert returns parsed array

// Test: normalizeArtifact('flashcards', flashcardArray) passes through pre-parsed arrays unchanged
// - Call with an already-parsed array
// - Assert returns the same array unchanged
```

---

## Implementation Details

### 1. Harden Flashcard Prompt

**MODIFY: `01-agent-pipeline/beacon/prompts.py`**

Add an explicit prohibition to `GENERATE_FLASHCARDS_PROMPT`. Near the existing "Respond with ONLY the JSON array" instruction, add:

```
Do NOT wrap your response in markdown code fences. No ``` or ```json wrappers.
```

This reduces the frequency of Claude adding fences, but does not eliminate it entirely (hence the stripping logic below).

### 2. Replace Line-Based Fence Stripping with Regex

**MODIFY: `01-agent-pipeline/beacon/synthesize.py`**

In `_generate_flashcards()`, replace the existing line-based fence stripping code (lines ~65-70) with a single regex substitution:

```python
import re

# Strip markdown code fences if present
text = re.sub(r'^\s*```(?:json)?\s*\n(.*?)\n\s*```\s*$', r'\1', text, flags=re.DOTALL)
```

This handles all fence variants:
- Opening ` ```json ` or ` ``` ` with optional whitespace
- Closing ` ``` ` with optional trailing whitespace
- Leading/trailing blank lines around the fences

The `re.DOTALL` flag allows `.` to match newlines in the captured group, so the entire JSON content between fences is preserved.

Add `import re` at the top of the file if not already present.

### 3. Frontend Safety Net

**MODIFY: `03-frontend-dashboard/src/lib/artifacts.ts`**

In the `normalizeArtifact()` function, in the `flashcards` case, add fence stripping before `JSON.parse()`. This is defense-in-depth — the backend should handle it, but the frontend should not break if a fenced string somehow reaches it.

Before the `JSON.parse(data)` call, add:

```typescript
if (typeof data === 'string') {
  // Strip markdown code fences if present
  let cleaned = data.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift(); // Remove opening fence line
    if (lines[lines.length - 1]?.trim() === '```') {
      lines.pop(); // Remove closing fence line
    }
    cleaned = lines.join('\n');
  }
  return JSON.parse(cleaned);
}
```

### 4. Add Hot-Reload for Pipeline Changes

**MODIFY: `02-api-streaming/server/__main__.py`**

Add `reload_dirs` to the `uvicorn.run()` call so that changes to `01-agent-pipeline/beacon/` trigger automatic server reload:

```python
uvicorn.run(
    "server.app:app",
    host="0.0.0.0",
    port=8000,
    reload=True,
    reload_dirs=[".", "../01-agent-pipeline"],
)
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `01-agent-pipeline/beacon/prompts.py` | MODIFY | Add code fence prohibition to flashcard prompt |
| `01-agent-pipeline/beacon/synthesize.py` | MODIFY | Replace line-based fence stripping with regex |
| `03-frontend-dashboard/src/lib/artifacts.ts` | MODIFY | Add frontend fence stripping safety net |
| `02-api-streaming/server/__main__.py` | MODIFY | Add reload_dirs for pipeline hot-reload |
| `01-agent-pipeline/tests/test_synthesize.py` | MODIFY | Add fence stripping test cases |
| `03-frontend-dashboard/src/lib/__tests__/artifacts.test.ts` | CREATE | Frontend fence stripping tests |

---

## Verification

After implementation, run tests in both layers:

```bash
# Python tests (from 01-agent-pipeline directory)
cd C:\git_repos\playground\hackathon\01-agent-pipeline
uv run pytest -x

# Frontend tests (from 03-frontend-dashboard directory)
cd C:\git_repos\playground\hackathon\03-frontend-dashboard
npm test
```

All existing tests must continue to pass, and all new fence stripping tests must pass.

---

## Implementation Notes

**Status:** Complete. All changes implemented exactly as planned, no deviations.

**Test Results:**
- Backend: 17/17 tests pass (12 existing + 5 new fence stripping tests)
- Frontend: 4/4 tests pass (all new)

**Code Review:** PASS - No fixes required. Minor non-blocking observations documented in `implementation/code_review/section-01-review.md`.
