# Research Findings: Agent Pipeline Best Practices

## Key Discovery: Claude on Azure Uses AnthropicFoundry

**Critical**: Claude on Azure is accessed via `AnthropicFoundry` / `AsyncAnthropicFoundry` from the standard `anthropic` Python SDK — NOT the Azure OpenAI SDK.

```python
from anthropic import AsyncAnthropicFoundry

client = AsyncAnthropicFoundry(
    api_key="YOUR_AZURE_API_KEY",
    resource="your-resource-name",
)
```

Authentication: API key for dev, Entra ID for production.
Available models: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, etc.

**Foundry limitations**: No Batch API, no rate-limit headers in responses.
**Structured outputs**: `output_config` with `json_schema` is in public beta on Foundry. Also supports Pydantic `.parse()` helper and strict tool_use.

---

## 1. Tavily API

### Search
- `AsyncTavilyClient` for async, env var `TAVILY_API_KEY`
- `max_results`: 0-20 (not 30 as originally spec'd — need multiple queries for "deep" mode)
- `search_depth`: "basic" (1 credit), "advanced" (2 credits)
- `include_raw_content`: can be "markdown" or "text" for inline content
- Free tier: 1,000 credits/month, 100 RPM

### Extract
- Up to 20 URLs per request
- Returns `results` + `failed_results`
- `format`: "markdown" or "text"
- Good fallback for JS-rendered pages
- 1 credit per 5 URLs (basic)

### Error handling
- Use `return_exceptions=True` with `asyncio.gather` for parallel calls
- HTTP 429 = rate limit, 432 = plan limit

---

## 2. Claude API (Azure/Foundry) Async Patterns

### Async calls
```python
client = AsyncAnthropicFoundry(api_key=..., resource=...)
message = await client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}],
)
```

### Parallel calls
```python
results = await asyncio.gather(*[call_claude(p) for p in prompts], return_exceptions=True)
```

### Structured output (3 approaches)
1. **json_schema via output_config** (public beta on Foundry):
   ```python
   response = client.messages.create(..., output_config={"format": {"type": "json_schema", "schema": {...}}})
   ```
2. **Pydantic .parse()** helper:
   ```python
   response = client.messages.parse(..., output_format=MyModel)
   result = response.parsed_output  # typed Pydantic object
   ```
3. **Strict tool_use**:
   ```python
   tools=[{"name": "extract", "strict": True, "input_schema": {...}}]
   ```

### Rate limits on Foundry
- claude-sonnet-4-6: 2,000 RPM, 2M TPM
- claude-haiku-4-5: 4,000 RPM, 4M TPM

### Built-in retries
SDK has automatic retries with exponential backoff for 429, 500, connection errors.

---

## 3. Python Async Generator Pipeline Patterns

### Composition
Chain generators: source → transform → consume. Each stage yields to the next.

### Typed events
Use Union type or dataclasses for different event types (ProgressEvent, ResultEvent, etc.)

### Error handling
- `try/finally` works in async generators
- `await` OK in `finally`, but `yield` in `finally` raises RuntimeError
- Use `contextlib.aclosing()` for deterministic cleanup

### Concurrency control
- `asyncio.Semaphore(N)` for max concurrent operations
- `asyncio.Queue(maxsize=N)` for backpressure
- Natural backpressure: producer only advances when consumer calls `__anext__()`

---

## 4. Web Content Extraction

### Recommended extraction cascade
1. **Trafilatura** (best quality, F1=0.937): `trafilatura.extract(html, output_format="markdown")`
2. **BeautifulSoup** (fallback): Remove script/style/nav, extract from main/article
3. **Tavily Extract API** (final fallback): Handles JS-rendered pages, paywalls

### httpx best practices
- Reuse `AsyncClient` instance
- Explicit timeouts: `httpx.Timeout(connect=5, read=15, write=5, pool=10)`
- Connection limits: `httpx.Limits(max_connections=100, max_keepalive=20)`
- `follow_redirects=True`, `http2=True`

### Trafilatura
```python
import trafilatura
content = trafilatura.extract(html, output_format="markdown", include_tables=True, include_links=True)
```

---

## Spec Adjustments Based on Research

1. **Tavily max_results is 20 (not 30)**: "Deep" mode needs 2 search queries or use `search_depth="advanced"`
2. **Use trafilatura instead of BeautifulSoup** as primary extractor (much higher quality)
3. **Use AnthropicFoundry, not Anthropic**: Azure deployment requires different client class
4. **Structured output**: Use `output_config` json_schema or `.parse()` for evaluation scoring
5. **Add trafilatura to dependencies**: `pip install trafilatura`

---

## Testing Notes

- **New project**: No existing test setup
- Recommend: `pytest` + `pytest-asyncio` for async testing
- Mock external APIs with `respx` (httpx mock) and `unittest.mock`
- Test pipeline stages independently with fixture data
