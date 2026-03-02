# Code Review Interview: Section 05 - Extract

## Auto-fixes Applied

1. **Per-URL exception safety in trafilatura fallback** - Added try/except in `_fetch_with_trafilatura` so that if trafilatura raises for a single URL, it returns `(url, None)` instead of crashing `asyncio.gather` and the entire pipeline.

2. **Added logging** - Added `logging.getLogger(__name__)` and:
   - `logger.warning()` when Tavily batch call fails (with exc_info)
   - `logger.info()` when falling back to trafilatura with URL count
   - `logger.warning()` when trafilatura fails for individual URLs

3. **Removed unused MagicMock import** from test file.

4. **Added mixed-results test** (`TestMixedResults.test_mixed_tavily_success_and_failure`) - Tests the common scenario where some URLs succeed via Tavily and others fail, verifying both extraction methods are correctly assigned.

5. **Added trafilatura exception test** (`TestMixedResults.test_trafilatura_exception_falls_back_to_snippet`) - Tests that a trafilatura crash for a URL falls through to snippet_only.

## User Decisions

1. **Logging**: User approved adding logging for Tavily batch failures and trafilatura fallbacks.

## Let Go (Not Addressed)

- Type annotation on `client` parameter (test mocks make it impractical)
- Longer docstring (existing one is clear enough)
- Test for empty sources (trivial guard, tested implicitly)
- Auto-creating client from env when `client=None` (pipeline always passes it)
- `test_uses_correct_tavily_params` (plan hedges on param names)
- `test_trafilatura_called_with_correct_params` (covered by to_thread mock tests)
