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
You are a research synthesizer. Based on the sources provided below, write an executive summary that:

1. Synthesizes insights ACROSS all sources (do not summarize each source individually)
2. Highlights areas of consensus and any disagreements between sources
3. Uses clear markdown headings to organize the summary
4. Is 1-2 pages of well-structured markdown

Focus on the most important findings and practical takeaways. Write for someone who wants to quickly understand the current state of knowledge on this topic.

{context}

Write the executive summary now."""

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
