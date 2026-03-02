# Section 03 - Search: Staged Diff

## beacon/search.py (new file)
- Tavily search integration with AsyncTavilyClient
- `normalize_url()` for URL deduplication (strips trailing slashes, fragments, utm_* params)
- `_generate_complementary_query()` for deep-mode second query
- `_deduplicate_sources()` keeps longest snippet per normalized URL
- `search()` async function: single-query mode (num_queries=1), dual-query mode (num_queries>=2)
- Dependency injection via optional `client` parameter

## tests/test_search.py (new file)
- 12 tests across 5 test classes
- TestSearchReturnsSourceObjects: return type and field mapping
- TestSearchParameters: correct Tavily API params
- TestSingleQueryMode: single call verification
- TestDeepModeMultiQuery: dual call, dedup by URL, longest snippet, utm params, fragments
- TestEdgeCases: empty results, API failure propagation
