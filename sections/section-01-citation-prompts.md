# Section 1: Evidence Anchoring -- Backend Prompt Changes

## Overview

This section modifies the `GENERATE_SUMMARY_PROMPT` in `01-agent-pipeline/beacon/prompts.py` to instruct the LLM to include inline `[Source Title](cite:N)` citation markers in the summary. No other backend changes needed — citations flow through as standard markdown.

## Background

Beacon's pipeline synthesizes research from multiple evaluated sources. The `build_synthesis_context()` function in `prompts.py` already numbers sources with `enumerate(sources, 1)`, producing a context block like:

```
## Source 1: Some Title
**URL:** https://example.com
**Score:** 8/10
**Key Insight:** Great tutorial.
...

## Source 2: Another Title
...
```

Because sources are already numbered in the context, the LLM has all the information it needs to reference them by index. The frontend (Section 2) will intercept `cite:N` links and render them as superscript citation badges with hover popovers.

**Important:** Drill-down link instructions (`drill://`) are NOT added in this section. Those are added in Section 5 (Drill Down -- Backend Endpoint) to avoid broken UI links during incremental implementation.

## Tests

No dedicated test stubs are required for prompt text changes. Prompts are template strings, not logic. The prompt correctness is validated by integration testing (running a real research pipeline and checking citations appear).

However, the existing test in `01-agent-pipeline/tests/test_prompts.py` verifies `GENERATE_SUMMARY_PROMPT` is non-empty. After this change, it may be useful to add a lightweight assertion that the prompt mentions the citation format. Add the following test to the existing `TestPromptConstants` class:

**File:** `01-agent-pipeline/tests/test_prompts.py`

```python
def test_summary_prompt_includes_citation_instructions(self):
    """GENERATE_SUMMARY_PROMPT must instruct the LLM to use cite:N format."""
    assert "cite:" in GENERATE_SUMMARY_PROMPT
```

This test is intentionally minimal -- it confirms the citation instructions are present without being brittle about exact wording.

## Implementation

**File to modify:** `01-agent-pipeline/beacon/prompts.py`

### Current State of `GENERATE_SUMMARY_PROMPT`

The prompt currently reads:

```python
GENERATE_SUMMARY_PROMPT = """\
You are a research synthesizer. Based on the sources provided below, write an executive summary that:

1. Synthesizes insights ACROSS all sources (do not summarize each source individually)
2. Highlights areas of consensus and any disagreements between sources
3. Uses clear markdown headings to organize the summary
4. Is 1-2 pages of well-structured markdown

Focus on the most important findings and practical takeaways. Write for someone who wants to quickly understand the current state of knowledge on this topic.

{context}

Write the executive summary now."""
```

### Required Change

Append citation instructions to the numbered list in the prompt. The instructions should be added as new numbered items (items 5-8) before the "Focus on..." paragraph. The key points to convey to the LLM:

1. **Every factual claim needs a citation** using the format `[Source Title](cite:N)` where N is the 1-indexed source number matching the order sources appear in the context block.
2. **Every paragraph should have at least one citation.**
3. **Multiple citations can be placed together** when a claim is supported by multiple sources: `[Title A](cite:1)[Title B](cite:3)`.
4. The `cite:N` format is a markdown link with a custom URI scheme -- the LLM should use standard markdown link syntax.

### Updated Prompt

The `GENERATE_SUMMARY_PROMPT` should become:

```python
GENERATE_SUMMARY_PROMPT = """\
You are a research synthesizer. Based on the sources provided below, write an executive summary that:

1. Synthesizes insights ACROSS all sources (do not summarize each source individually)
2. Highlights areas of consensus and any disagreements between sources
3. Uses clear markdown headings to organize the summary
4. Is 1-2 pages of well-structured markdown
5. Includes inline citations for every factual claim using the format [Source Title](cite:N) where N is the 1-indexed source number (matching the order sources appear above)
6. Every paragraph must have at least one citation
7. Multiple citations can be placed together when a claim is supported by multiple sources: [Title A](cite:1)[Title B](cite:3)
8. Use the exact source titles as they appear in the source headings above

Focus on the most important findings and practical takeaways. Write for someone who wants to quickly understand the current state of knowledge on this topic.

{context}

Write the executive summary now."""
```

### Why This Approach Works

- **No custom parsing needed.** `[Source Title](cite:N)` is valid markdown link syntax. The `cite:` scheme is non-standard but parses correctly in any markdown parser.
- **react-markdown handles it.** The frontend already uses react-markdown, which parses links and passes them to an `a` component override. The frontend (Section 2) simply checks the href scheme and renders differently for `cite:` vs `http`.
- **Source numbering is stable.** `build_synthesis_context()` uses `enumerate(sources, 1)` to number sources. The same source list in the same order goes to both the prompt and the frontend, so `cite:1` always refers to the correct source -- provided the frontend uses the original unsorted `sources` array (not a re-sorted version).

## Dependencies

- **No dependencies on other sections.** This section has no prerequisites.
- **Blocks Section 2** (Evidence Anchoring -- Frontend Citation UI), which renders the `cite:N` links in the browser.

## Files Changed

| File | Change |
|------|--------|
| `01-agent-pipeline/beacon/prompts.py` | Add citation instructions to `GENERATE_SUMMARY_PROMPT` |
| `01-agent-pipeline/tests/test_prompts.py` | Add `test_summary_prompt_includes_citation_instructions` to `TestPromptConstants` |

## Verification

After implementation, run:

```bash
cd 01-agent-pipeline
uv run pytest tests/test_prompts.py -v
```

All existing prompt tests should continue to pass, and the new `test_summary_prompt_includes_citation_instructions` test should pass.

## Implementation Notes

- Implementation matched the plan exactly. No deviations.
- All 9 tests pass (8 existing + 1 new).
- Code review: PASS with no actionable findings.
