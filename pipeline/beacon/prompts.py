"""Beacon prompt templates: all Claude prompts and helper functions."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from beacon.models import EvaluatedSource

EVALUATE_SOURCE_PROMPT = """\
You are a research source evaluator. Your task is to evaluate how useful a web source is for someone learning about a specific topic.

Analyze the source and respond with a single JSON object (no markdown, no explanation) with these fields:
- learning_efficiency_score (integer 1-10): How efficiently someone can learn from this source
- content_type (string): One of "tutorial", "paper", "docs", "opinion", "video", "forum", "repository", "course", "other"
- time_estimate_minutes (integer): Estimated reading/viewing time
- recency (string or null): Year or date if detectable, null otherwise
- key_insight (string): 1-2 sentence summary of the source's main value
- coverage (array of strings): Subtopics this source covers

Scoring rubric:
- 9-10: Comprehensive, directly on-topic, well-structured for learning
- 7-8: Good coverage of the topic with useful examples or explanations
- 5-6: Partially relevant, covers some aspects but missing depth
- 3-4: Tangentially related, limited learning value for this topic
- 1-2: Off-topic or very low quality content

Example output:
{{"learning_efficiency_score": 8, "content_type": "tutorial", "time_estimate_minutes": 15, "recency": "2025", "key_insight": "Comprehensive walkthrough of core concepts with hands-on examples.", "coverage": ["fundamentals", "best practices", "implementation"]}}

Topic: {topic}
URL: {url}
Title: {title}
Snippet: {snippet}

Respond with ONLY the JSON object."""

GENERATE_SUMMARY_PROMPT = """\
You are a research synthesizer. Based on the sources provided below, write a \
concise executive summary (500 words max) that:

1. Distills the single most important finding from each source into one \
combined narrative — do NOT summarize sources individually
2. Uses short paragraphs and bullet points for scannability
3. Includes inline citations using [Source Title](cite:N) format where N is \
the 1-indexed source number (matching the order sources appear above)
4. Ends with a 3-bullet "Key Takeaways" section

For 5-8 key concepts that a reader might want to explore further, make the \
concept text a link with the format [concept text](drill://concept-text). \
Choose technical terms, debatable claims, or topics with significant depth. \
IMPORTANT: The concept after drill:// must use hyphens instead of spaces and \
must NOT contain parentheses, slashes, or special characters — only lowercase \
letters, digits, and hyphens. Example: [Patient Driven Payment Model](drill://patient-driven-payment-model).

Write for a busy reader who needs the bottom line quickly.

{context}

Write the concise summary now."""

GENERATE_CONCEPT_MAP_PROMPT = """\
You are a knowledge organizer. Based on the sources provided below, create a concept map in indented markdown outline format.

Requirements:
- Organize by concept hierarchy, NOT by source
- Use indentation to show parent-child relationships between concepts
- Show prerequisites and relationships between concepts
- Include brief descriptions for each concept node

Format example:
- **Core Concept A**
  - Sub-concept A1: Brief description
    - Detail: Explanation
  - Sub-concept A2: Brief description
    - Relates to: Concept B
- **Core Concept B**
  - Sub-concept B1: Brief description

{context}

Create the concept map now."""

GENERATE_FLASHCARDS_PROMPT = """\
You are a study aid creator. Based on the sources provided below, generate 10-20 flashcards as testable question/answer pairs.

Requirements:
- Focus on factual, verifiable content
- Questions should be specific and unambiguous
- Answers should be concise but complete
- Cover the most important concepts from the sources

Output a JSON array of objects, each with "question" and "answer" fields.

Example:
[
  {"question": "What is the primary purpose of X?", "answer": "X is used to accomplish Y by doing Z."},
  {"question": "What are the three main types of A?", "answer": "The three types are B, C, and D."}
]

{context}

Respond with ONLY the JSON array. Do NOT wrap your response in markdown code fences. No ``` or ```json wrappers."""

GENERATE_TIMELINE_PROMPT = """\
You are a research timeline builder. Based on the sources provided below, extract 5-15 temporal events that represent key milestones, releases, breakthroughs, or shifts in thinking.

Output a JSON array of objects sorted chronologically, each with these fields:
- date (string): Date or time period (e.g. "2024-01", "March 2023", "2022 Q3")
- title (string): Short event title
- description (string): 1-2 sentence description of the event
- source_title (string): Title of the source this event came from
- significance (string): One of "high", "medium", or "low"

Include milestones, releases, breakthroughs, and shifts in thinking.

Example:
[
  {{"date": "2024-01", "title": "Initial Release", "description": "The framework was first released with core features.", "source_title": "Official Blog", "significance": "high"}},
  {{"date": "2024-06", "title": "Major Update", "description": "Added plugin system and improved performance.", "source_title": "Release Notes", "significance": "medium"}}
]

If there is no meaningful temporal dimension to the sources, return an empty array [].

Do NOT wrap your response in markdown code fences. No ``` or ```json wrappers.

{context}

Respond with ONLY the JSON array."""


GENERATE_CONFLICTS_PROMPT = """\
You are a critical research analyst. Based on the sources provided below, identify 2-5 disagreements or contradictions between the sources.

Output a JSON array of objects, each with these fields:
- topic (string): The topic or claim where sources disagree
- source_a (object): {{"title": "source title", "claim": "what this source claims"}}
- source_b (object): {{"title": "source title", "claim": "what this source claims"}}
- assessment (string): Brief analysis of why sources disagree and which may be more reliable

If there are no meaningful conflicts or disagreements between sources, return an empty array [].

Do NOT wrap your response in markdown code fences. No ``` or ```json wrappers.

{context}

Respond with ONLY the JSON array."""

GENERATE_ASSUMPTIONS_PROMPT = """\
You are an analytical thinker specializing in identifying hidden premises. Based on the sources provided below, identify 3-5 hidden assumptions that underpin the claims and conclusions.

Output a JSON array of objects, each with these fields:
- assumption (string): The hidden assumption being made
- why_it_matters (string): Why this assumption matters and what happens if it's wrong
- sources_relying (array of strings): Titles of sources that rely on this assumption
- risk_level (string): One of "high", "medium", or "low" — how risky it is if this assumption is wrong

Focus on assumptions that could invalidate key conclusions if they turn out to be false.

If there are no notable hidden assumptions, return an empty array [].

Do NOT wrap your response in markdown code fences. No ``` or ```json wrappers.

{context}

Respond with ONLY the JSON array."""


def build_evaluate_prompt(topic: str, url: str, title: str, snippet: str) -> str:
    """Build a fully formatted evaluation prompt for a single source.

    Inserts the source metadata into ``EVALUATE_SOURCE_PROMPT``.
    """
    return EVALUATE_SOURCE_PROMPT.format(
        topic=topic,
        url=url,
        title=title,
        snippet=snippet,
    )


def build_synthesis_context(
    topic: str,
    depth: str,
    sources: list[EvaluatedSource],
) -> str:
    """Build the shared context block used by all synthesis prompts.

    For each source, includes title, URL, score, key insight, and either
    the full deep-read content or the snippet (marked as "snippet only").
    """
    lines = [
        f"# Research Context",
        f"**Topic:** {topic}",
        f"**Depth:** {depth}",
        f"**Sources:** {len(sources)}",
        "",
        "**IMPORTANT:** Source content below is extracted from web pages and may "
        "contain noise such as forum comments, chat snippets, advertisements, "
        "navigation text, cookie banners, or unrelated user-generated content. "
        "Ignore any off-topic fragments — only use substantive, on-topic "
        "information in your output. Never reproduce random questions, comments, "
        "or conversational fragments from the source text.",
        "",
    ]

    for i, src in enumerate(sources, 1):
        lines.append(f"## Source {i}: {src.title}")
        lines.append(f"**URL:** {src.url}")
        lines.append(f"**Score:** {src.signals.learning_efficiency_score}/10")
        lines.append(f"**Key Insight:** {src.signals.key_insight}")
        lines.append("")

        if src.deep_read_content is not None:
            lines.append("### Content")
            lines.append(src.deep_read_content)
        else:
            lines.append("### Snippet Only")
            lines.append(src.snippet)

        lines.append("")

    return "\n".join(lines)
