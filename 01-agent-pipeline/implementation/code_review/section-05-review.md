# Code Review: Section 05 - Extract

OVERALL VERDICT: PASS with minor observations.

The implementation in beacon/extract.py and tests/test_extract.py is a faithful, well-structured rendition of the section-05-extract.md plan. The three-tier cascade, content validation, semaphore concurrency, and immutable model_copy pattern are all correctly implemented.

## 1. Plan Conformance

- [PASS] Function signature matches plan (minor: no type annotation on client param)
- [PASS] Three-tier cascade: Tavily batch -> trafilatura -> snippet_only
- [PASS] _validate_content helper matches plan spec exactly
- [PASS] _trafilatura_extract helper wraps both fetch_url and extract correctly
- [PASS] Batch failure handling catches any Tavily exception
- [PASS] Semaphore concurrency with EXTRACT_SEMAPHORE_LIMIT=5
- [PASS] model_copy usage for Pydantic immutability
- [PASS] Empty sources guard

## 2. Bugs and Edge Cases

- [OK] client=None: Will cause AttributeError caught by except block, silently degrading to trafilatura. DEVIATION from plan (plan says auto-create client). Pipeline caller always passes client so unlikely to surface.
- [OK] Duplicate URLs handled correctly via dict lookup
- [MEDIUM] trafilatura exception handling: If _trafilatura_extract raises, it propagates through asyncio.gather. Should catch per-URL exceptions in _fetch_with_trafilatura.
- [OK] Double _validate_content call for Tavily results is redundant but not a bug

## 3. Test Coverage Gaps

- MISSING: test_uses_correct_tavily_params (dropped from plan)
- MISSING: test_trafilatura_called_with_correct_params (dropped from plan)
- MISSING: test_empty_sources_returns_empty_list
- MISSING: test_mixed_results (some Tavily succeed, some fail in same batch)
- MISSING: test_trafilatura_exception_per_url
- LOW: Unused MagicMock import in test file

## 4. Additional Observations

- No logging for batch failures (plan says "log the error")
- No type annotation on client parameter
- Shorter docstring than plan specified
