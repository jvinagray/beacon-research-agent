# Code Review: Section 03 - Search

The implementation in beacon/search.py is a near-verbatim copy of the section plan. It is functionally correct and all plan requirements are covered, but a senior architect would flag the following issues:

1. MISSING ERROR HANDLING ON KEY LOOKUP (Medium severity, line 61): When client is None, `os.environ["TAVILY_API_KEY"]` will raise a raw `KeyError` with no useful message. The config module already has `get_config()` with proper validation and `load_dotenv()` support. The search function should either use `get_config().tavily_key` or at minimum wrap the KeyError with a descriptive ValueError. As-is, a missing env var produces a confusing traceback.

2. NO LOGGING WHATSOEVER (Low-Medium severity): There is zero logging in search.py. For a production pipeline, you want to see what queries were sent, how many results came back, how many duplicates were removed, etc. When debugging why a research run returned poor results, operators will have no visibility into the search stage.

3. NO INPUT VALIDATION ON depth_config (Medium severity, line 67): The function directly indexes `depth_config["max_results"]` without any validation. If a caller passes a malformed dict missing this key, or passes a string where an int is expected, the error will be confusing (KeyError or a downstream Tavily error). The function signature says `dict` but should probably accept a TypedDict or at least validate the required keys up front.

4. SEQUENTIAL EXECUTION IN DEEP MODE (Low-Medium severity, lines 63-87): The two Tavily API calls in deep mode are executed sequentially (`await` one, then `await` the other). Since they are independent, they should be run concurrently with `asyncio.gather()`. This is an async function -- not using concurrency here defeats the purpose. Deep mode will take roughly 2x the latency it needs to.

5. normalize_url DOES NOT HANDLE SCHEME NORMALIZATION (Low severity, line 10-23): The normalize_url function does not lowercase the scheme or netloc. URLs like `HTTPS://Example.Com/page` and `https://example.com/page` would not be treated as duplicates. While Tavily is unlikely to return mixed-case URLs, the normalization function claims to be a general-purpose normalizer and should handle this per RFC 3986.

6. normalize_url DOES NOT HANDLE QUERY PARAM ORDERING (Low severity, line 21): `parse_qs` returns params in insertion order but the same params in different order (`?a=1&b=2` vs `?b=2&a=1`) would produce different urlencode outputs. For robust dedup, sorted keys should be used: `urlencode(sorted(filtered.items()), doseq=True)`.

7. NO TIMEOUT OR RETRY LOGIC (Medium severity): The Tavily API calls have no timeout configuration and no retry on transient failures. A slow or flaky Tavily response will hang the entire pipeline indefinitely. At minimum, an `asyncio.wait_for` with a reasonable timeout should wrap the calls.

8. SINGLE-QUERY MODE DOES NOT DEDUP (Low severity, line 75): If a single Tavily response contains duplicate URLs (which can happen), they are passed through without dedup. Dedup is only applied in deep mode. Consider always deduplicating.

9. THE DIFF FILE IS A SUMMARY, NOT AN ACTUAL DIFF (Observation): The diff file contained only a prose summary rather than a real unified diff. This is a process issue.

10. TEST COVERAGE GAP - NO TEST FOR normalize_url IN ISOLATION (Low severity): The plan's verification steps explicitly say to verify `normalize_url("https://example.com/page/?utm_source=x#section")` returns `"https://example.com/page"`. There is no direct unit test for `normalize_url` in the test file. It is only tested indirectly through the search function's dedup behavior.

11. TEST COVERAGE GAP - NO TEST FOR _generate_complementary_query (Low severity): There is no test that validates the complementary query generation.

12. UNUSED IMPORT (Trivial, test file line 3): `patch` is imported from `unittest.mock` but never used in any test.

SUMMARY: The implementation faithfully reproduces the plan, which is both a strength and a weakness. The most impactful issues are the lack of concurrent execution in deep mode (item 4), the raw KeyError on missing env var bypassing the existing config module (item 1), and the absence of any timeout/retry logic (item 7).
