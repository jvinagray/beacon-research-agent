# Code Review Interview: Section 03 - Search

**Date:** 2026-03-02

## Findings Triage

### Auto-fixes (applying without discussion)

1. **Use get_config() for API key** - Replace raw `os.environ["TAVILY_API_KEY"]` with `get_config().tavily_api_key` for consistent error handling and .env loading.
2. **Concurrent deep-mode queries** - Use `asyncio.gather()` to run both Tavily calls concurrently in deep mode instead of sequentially.
3. **Add normalize_url unit test** - Add direct test for `normalize_url()` as specified in the plan's verification steps.
4. **Remove unused import** - Remove unused `patch` import from test file.

### Interview decisions

5. **Tavily API timeout** - User chose: "Defer to pipeline". Timeout handling will be done at the orchestration level in section-07, keeping the search module simple.

### Let go (no action)

- Logging: deferred to pipeline section
- depth_config validation: internal callers use validated get_depth_settings()
- Scheme/netloc normalization: Tavily returns consistent URLs
- Query param ordering: consistent from Tavily
- Single-query dedup: not needed for single Tavily responses
- Test for _generate_complementary_query: trivial private helper
