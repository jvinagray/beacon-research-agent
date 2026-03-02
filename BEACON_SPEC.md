# Beacon - AI R&D Agent
## Spec & Implementation Plan

### Context
Building a solo hackathon submission for Megadata's AI Build Challenge (deadline: March 10, 2026). The goal is to win the $500 prize by shipping a polished, demo-ready AI tool that showcases real agentic intelligence. Beacon fills a gap between "just Googling it" and spending hours manually curating research - it's an AI research agent that finds, evaluates, and synthesizes the best resources on any topic, optimized for learning efficiency.

---

## Product Spec

### One-liner
**Beacon**: Give it a topic, get back an intelligently curated knowledge base with learning artifacts - in minutes, not hours.

### Differentiator
Source intelligence. Beacon doesn't just find links - it **shows its work**. It evaluates each source for learning efficiency (time-to-value), tells you *why* each resource matters, and generates ready-to-use learning materials. The "wow moment" is watching the agent reason about which sources give you the most knowledge per minute invested.

### User Flow
1. User enters a topic (e.g. "agentic RAG patterns") + selects depth (Quick / Standard / Deep)
2. Beacon searches the web, collects candidate sources
3. Agent evaluates snippets, scores and ranks by learning efficiency
4. Agent deep-reads the top sources (full content extraction)
5. Agent generates 4 artifacts from the synthesized knowledge
6. User browses an interactive knowledge base dashboard
7. User can export everything to Markdown/PDF

### Depth Settings
| Level | Sources Found | Deep-Read | Est. Time |
|-------|--------------|-----------|-----------|
| Quick | 5-10 | Top 3 | ~1-2 min |
| Standard | 15-20 | Top 7 | ~3-5 min |
| Deep | 25-30 | Top 10 | ~5-8 min |

### Source Intelligence Signals (per source)
- **Learning efficiency score** - estimated knowledge-per-minute (the headline metric)
- **Content type** - tutorial, research paper, documentation, opinion/blog, video
- **Time estimate** - how long it takes to consume this source
- **Recency** - publication date, freshness signal
- **Key insight** - the single most important takeaway from this source
- **Coverage** - which subtopics of the query this source addresses

### Generated Artifacts
1. **Executive Summary** - 1-2 page synthesis of the topic from all sources. TL;DR for the busy researcher.
2. **Ranked Resource List** - Every source with intelligence signals displayed. The "curated bibliography."
3. **Concept Map / Outline** - Key concepts, relationships, and prerequisite knowledge. The mental model.
4. **Flashcards / Key Takeaways** - Bite-sized knowledge cards extracted from sources. Quick retention.

### Persistence
- Session-based (no database for MVP)
- Export to Markdown button
- Export to PDF button (stretch goal - Markdown is sufficient)

---

## Technical Architecture

### Stack
- **Frontend**: Lovable (generates React app) - handles UI/UX
- **Backend**: Python + FastAPI - the agent brain
- **LLM**: Anthropic Claude API (claude-sonnet-4-6 for bulk work, claude-opus-4-6 for complex synthesis if budget allows)
- **Search**: Tavily API (built-in relevance scoring, free tier = 1000 searches/month)
- **Content Extraction**: Tavily extract OR BeautifulSoup/httpx for scraping
- **Deployment**: Local (uvicorn) for demo recording

### API Design

```
POST /api/research
Body: { "topic": "agentic RAG patterns", "depth": "standard" }
Response: SSE stream of progress events

Events:
  { "type": "status", "message": "Searching for sources..." }
  { "type": "sources_found", "data": [...] }
  { "type": "status", "message": "Evaluating source 3 of 20..." }
  { "type": "source_evaluated", "data": { source + intelligence signals } }
  { "type": "status", "message": "Deep-reading top sources..." }
  { "type": "status", "message": "Generating artifacts..." }
  { "type": "artifact", "artifact_type": "summary", "data": "..." }
  { "type": "artifact", "artifact_type": "resources", "data": [...] }
  { "type": "artifact", "artifact_type": "concept_map", "data": "..." }
  { "type": "artifact", "artifact_type": "flashcards", "data": [...] }
  { "type": "complete" }

GET /api/export/{session_id}?format=markdown
Response: Markdown file download
```

### Agent Pipeline (the core logic)

```
Topic + Depth
    |
    v
[1. SEARCH] -- Tavily API --> raw results (URLs, snippets, titles)
    |
    v
[2. EVALUATE] -- Claude batch call --> scored + typed sources
    |           (input: snippet + metadata per source)
    |           (output: learning_efficiency, content_type, time_est, key_insight)
    |
    v
[3. RANK + SELECT] -- sort by learning_efficiency --> top N for deep-read
    |
    v
[4. DEEP-READ] -- Tavily extract / httpx+BS4 --> full text of top sources
    |
    v
[5. SYNTHESIZE] -- Claude calls (can be parallel):
    |   ├── Executive Summary (input: all deep-read content)
    |   ├── Concept Map (input: all deep-read content)
    |   └── Flashcards (input: all deep-read content)
    |
    v
[6. PACKAGE] -- Combine all artifacts + ranked sources --> response
```

### Frontend Pages (Lovable)

**Page 1: Home / Search**
- Clean input field: "What do you want to learn about?"
- Depth selector: Quick / Standard / Deep (radio buttons or slider)
- "Research" button
- Below: progress feed showing agent status in real-time

**Page 2: Knowledge Base Dashboard**
- Tab navigation: Summary | Sources | Concept Map | Flashcards
- **Sources tab** (default): Cards for each source showing:
  - Title + URL
  - Learning efficiency badge (e.g. "High efficiency - 5 min read, covers 3 key concepts")
  - Content type tag
  - Key insight preview
  - Expand for full details
- **Summary tab**: Rendered markdown of executive summary
- **Concept Map tab**: Structured outline (tree or indented list for MVP, actual graph is stretch)
- **Flashcards tab**: Card-flip UI or simple Q&A list
- Export button (top right)

---

## Budget Breakdown
| Service | Est. Cost | Notes |
|---------|-----------|-------|
| Anthropic Claude API | $20-40 | Sonnet for bulk, dev + testing + demo |
| Tavily API | $0-10 | Free tier likely sufficient |
| Lovable | $0 | Free tier |
| Total | ~$30-50 | Well under $100 limit |

---

## Implementation Plan (8 days)

### Day 1-2: Backend Core
- [ ] Set up Python project (FastAPI + uvicorn)
- [ ] Integrate Tavily search API
- [ ] Build the EVALUATE step (Claude call to score sources)
- [ ] Build the DEEP-READ step (content extraction)
- [ ] Test pipeline end-to-end in terminal

### Day 3-4: Artifact Generation + API
- [ ] Build SYNTHESIZE step (executive summary, concept map, flashcards)
- [ ] Implement SSE streaming endpoint
- [ ] Build export-to-markdown endpoint
- [ ] Add depth configuration (quick/standard/deep)

### Day 5-6: Frontend (Lovable)
- [ ] Generate search/home page in Lovable
- [ ] Generate knowledge base dashboard with tabs
- [ ] Wire up SSE streaming for real-time progress
- [ ] Build source cards with intelligence signals
- [ ] Add export button

### Day 7: Integration + Polish
- [ ] End-to-end testing with real topics
- [ ] Tune prompts for quality (especially learning efficiency scoring)
- [ ] Handle edge cases (no results, failed scrapes, long content)
- [ ] UI polish

### Day 8: Demo
- [ ] Script the Loom demo
- [ ] Record demo (pick a compelling topic)
- [ ] Submit to https://megaathon.lovable.app

---

## Verification / Demo Plan
1. Run backend locally: `uvicorn app:app --reload`
2. Open Lovable frontend
3. Enter topic: "agentic RAG patterns" with Standard depth
4. Verify: progress events stream in real-time
5. Verify: sources appear with learning efficiency scores + intelligence signals
6. Verify: all 4 artifact tabs populated with quality content
7. Verify: export to Markdown produces a clean, readable file
8. Record Loom showing the full flow + call out the source intelligence reasoning

---

## Key Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Content extraction fails for some sites | Graceful fallback to snippet-only evaluation |
| LLM scoring is inconsistent | Few-shot examples in evaluation prompt, calibration testing |
| Frontend integration with SSE is tricky | Lovable may need manual JS edits; have fallback of polling |
| Scope creep on artifacts | Summary + resources are P0; concept map + flashcards are P1 |
| Demo topic doesn't showcase well | Test 3-4 topics in advance, pick the most impressive one |
