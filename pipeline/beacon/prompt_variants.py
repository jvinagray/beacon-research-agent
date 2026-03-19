"""Alternative prompt templates for A/B testing synthesis quality.

Each constant follows the same ``{context}`` placeholder pattern as the
default prompts in ``beacon.prompts``.  Users can add their own variants
here or in separate files and pass them via the ``prompt_overrides`` dict
to ``synthesize()`` or the A/B test runner.
"""

# ---------------------------------------------------------------------------
# Summary variants
# ---------------------------------------------------------------------------

GENERATE_SUMMARY_PROMPT_VERBOSE = """\
You are a research synthesizer. Based on the sources provided below, write an executive summary that:

1. Synthesizes insights ACROSS all sources (do not summarize each source individually)
2. Highlights areas of consensus and any disagreements between sources
3. Uses clear markdown headings to organize the summary
4. Is 1-2 pages of well-structured markdown
5. Includes inline citations for every factual claim using the format \
[Source Title](cite:N) where N is the 1-indexed source number
6. Every paragraph must have at least one citation
7. Multiple citations can be placed together: [Title A](cite:1)[Title B](cite:3)
8. Use the exact source titles as they appear in the source headings above

Focus on the most important findings and practical takeaways.

For 5-8 key concepts, make them drill-down links: [concept](drill://concept).

{context}

Write the executive summary now."""

GENERATE_SUMMARY_PROMPT_DETAILED = """\
You are a thorough research synthesizer. Based on the sources provided below, \
write an in-depth executive summary that:

1. Devotes one well-developed paragraph to each major theme across sources
2. Highlights areas of consensus, disagreement, and gaps in the literature
3. Uses clear markdown headings (##) to organize by theme
4. Includes inline citations for every claim using [Source Title](cite:N)
5. Concludes with a "Research Gaps" section listing questions that remain \
unanswered by the current sources

Aim for thoroughness — 3-4 pages of well-structured markdown is appropriate.

For 8-12 key concepts, make them drill-down links: [concept](drill://concept).

{context}

Write the detailed summary now."""

# ---------------------------------------------------------------------------
# Flashcard variants
# ---------------------------------------------------------------------------

GENERATE_FLASHCARDS_PROMPT_HARDER = """\
You are an expert study-aid creator focused on deep understanding. Based on \
the sources below, generate 10-15 flashcards that test conceptual mastery.

Requirements:
- Ask "why" and "how" questions, not just "what" questions
- Include comparison questions (e.g., "How does X differ from Y?")
- Include application questions (e.g., "When would you choose X over Y?")
- Answers should explain reasoning, not just state facts
- Cover the most important and nuanced concepts

Output a JSON array of objects with "question" and "answer" fields.

{context}

Respond with ONLY the JSON array. No markdown fences."""

# ---------------------------------------------------------------------------
# Timeline variants
# ---------------------------------------------------------------------------

GENERATE_TIMELINE_PROMPT_DETAILED = """\
You are a research timeline builder. Based on the sources provided below, \
extract 10-20 temporal events with rich contextual detail.

Output a JSON array sorted chronologically, each with:
- date (string): Specific date or period
- title (string): Short event title
- description (string): 2-3 sentence description with context and impact
- source_title (string): Title of the source
- significance (string): "high", "medium", or "low"
- category (string): One of "release", "breakthrough", "policy", "milestone", "other"

Include broader context events that shaped the topic, not just direct milestones.

If there is no meaningful temporal dimension, return [].

Do NOT wrap in code fences.

{context}

Respond with ONLY the JSON array."""
