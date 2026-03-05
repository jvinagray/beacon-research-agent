# Deep Project Interview - Beacon

## Context
Requirements file: BEACON_SPEC.md
Project: AI R&D Agent for Megadata hackathon (deadline March 10, 2026)

## Interview Summary

### Mental Model of Work Division
- User sees **three distinct layers**: agent pipeline logic, API/streaming layer, frontend dashboard
- The agent pipeline is where the core intelligence lives
- The API/streaming layer is NOT just glue — it has real architectural decisions (SSE event design, session management, export endpoint, CORS, error responses)
- The frontend is mostly Lovable-generated with minimal custom JS

### Pipeline Structure
- User sees evaluation/scoring and synthesis/artifact-generation as **two distinct problems** within the pipeline
- Different prompt strategies, different testing approaches
- However, they share a linear data flow (search → evaluate → rank → deep-read → synthesize)

### Frontend Expectations
- Mostly Lovable-generated (prompt Lovable, tweak a few things)
- Minimal custom JavaScript expected
- SSE consumption is the main integration challenge

### Biggest Uncertainty
- **Overall system design** — how all the pieces fit together
- Pipeline orchestration, error handling, data flow between steps
- Wants /deep-plan to help think through the architecture holistically

### Planning Preference
- Wants whatever produces the best result
- Not concerned about number of splits — trusts the process
- Hackathon timeline (8 days) is a constraint but quality of planning matters

### Key Decisions Already Made
- Stack: Python FastAPI + Lovable React + Claude API + Tavily
- Deployment: Local for demo
- Persistence: Session-based with Markdown export
- Depth selector: Quick/Standard/Deep (user-configurable)
- Source intelligence: Learning efficiency as headline metric
- Artifacts: Executive summary, ranked resources, concept map, flashcards
