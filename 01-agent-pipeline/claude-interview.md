# Agent Pipeline Interview Transcript

## Q1: Deep Mode Search Strategy
**Q**: Tavily max_results is 20 per query (not 30). For 'Deep' mode, run 2 queries or cap at 20?
**A**: Two queries, 30+ sources. Run 2 Tavily searches with different angles on the topic.

## Q2: Azure Setup Status
**Q**: Do you have Azure Foundry resource and API key ready?
**A**: Already set up with API key. Ready to use.

## Q3: Structured Output Approach
**Q**: For evaluation scoring, which structured output approach?
**A**: Whatever is most reliable. (Decision: Use Pydantic `.parse()` as primary — cleanest integration with typed models. Fall back to json_schema if `.parse()` is unreliable on Foundry beta.)

## Q4: Content Extraction Strategy
**Q**: Trafilatura cascade vs Tavily Extract vs hybrid?
**A**: Tavily Extract + trafilatura. Try Tavily Extract first (handles JS/paywalls), fall back to trafilatura for failures.

## Q5: Evaluation Parallelization
**Q**: One source per Claude call (parallel) vs batch vs mini-batches?
**A**: One source per Claude call (parallel). Send 15-20 parallel API calls via asyncio.gather.

## Q6: Model Selection Per Stage
**Q**: Which Claude model for evaluation vs synthesis?
**A**: Sonnet for evaluation (claude-sonnet-4-6), Opus for synthesis (claude-opus-4-6). Higher quality output for artifacts, cost-efficient for high-volume scoring.

## Q7: Error Handling Strategy
**Q**: What happens when pipeline encounters errors mid-stream?
**A**: Retry once then skip. One retry for transient errors (timeout, rate limit). If still fails, skip and continue.

## Q8: Token Budget Management
**Q**: How to handle deep-read content that's too long for synthesis?
**A**: Use trafilatura's precision mode (favor_precision=True). Aggressively filters content. Combine with char limit as safety net.

## Key Decisions Summary
- **Azure Foundry** with API key auth (already configured)
- **Two Tavily queries** for deep mode (different angles)
- **Tavily Extract → trafilatura** fallback cascade for content extraction
- **Parallel evaluation** (one Claude call per source, asyncio.gather)
- **Sonnet for eval, Opus for synthesis**
- **Retry once, then skip** for error handling
- **Trafilatura precision mode** + char limit for token management
- **Pydantic structured output** (`.parse()` or json_schema)
