"""LLM-as-judge prompt templates for evaluation metrics."""

JUDGE_RELEVANCE_PROMPT = """\
You are evaluating whether a web source is relevant to a research topic.

Topic: {topic}
Source Title: {title}
Source URL: {url}
Source Snippet: {snippet}

Is this source relevant to the topic? Consider:
- Does it directly address the topic or closely related concepts?
- Would a researcher studying this topic find this source useful?

Respond with ONLY a JSON object:
{{"relevant": true, "reason": "brief explanation"}}
or
{{"relevant": false, "reason": "brief explanation"}}"""

JUDGE_KEY_INSIGHT_PROMPT = """\
You are evaluating the quality of a key insight extracted from a web source.

Source Title: {title}
Source Snippet: {snippet}
Key Insight: {key_insight}

Score this key insight from 1-10:
- 9-10: Captures the source's unique value precisely and concisely
- 7-8: Good summary of the main value, minor improvements possible
- 5-6: Acceptable but generic or misses important nuance
- 3-4: Vague or partially inaccurate
- 1-2: Misleading or irrelevant to the source content

Respond with ONLY a JSON object:
{{"score": 8, "reason": "brief explanation"}}"""

JUDGE_CONTENT_TYPE_PROMPT = """\
You are classifying the content type of a web source.

Source Title: {title}
Source URL: {url}
Source Snippet: {snippet}

Classify this source into exactly one of these types:
"tutorial", "paper", "docs", "opinion", "video", "forum", "repository", "course", "other"

Respond with ONLY a JSON object:
{{"content_type": "tutorial", "confidence": "high"}}"""

JUDGE_COVERAGE_PROMPT = """\
You are identifying the expected subtopics for a research topic.

Topic: {topic}

List the key subtopics that a comprehensive set of sources should cover for this topic.

Respond with ONLY a JSON object:
{{"subtopics": ["subtopic1", "subtopic2", "subtopic3"]}}"""

JUDGE_CITATION_SUPPORT_PROMPT = """\
You are verifying whether a cited source supports a specific claim.

Claim: {claim}
Source Title: {source_title}
Source Content: {source_content}

Does this source actually support or contain information backing this claim?

Respond with ONLY a JSON object:
{{"supported": true, "reason": "brief explanation"}}
or
{{"supported": false, "reason": "brief explanation"}}"""

JUDGE_GROUNDEDNESS_PROMPT = """\
You are evaluating the factual groundedness of a paragraph from a research summary.

Paragraph:
{paragraph}

Available source material:
{sources_text}

Extract each factual claim from the paragraph and determine if it is grounded in the source material.

Respond with ONLY a JSON object:
{{"claims": [{{"claim": "the claim text", "grounded": true, "reason": "brief explanation"}}]}}"""

JUDGE_COMPLETENESS_PROMPT = """\
You are evaluating whether a research summary adequately covers the key topics from the source material.

Topic: {topic}

Source key insights:
{insights}

Summary:
{summary}

Identify the key topics that should be covered and check which ones appear in the summary.

Respond with ONLY a JSON object:
{{"key_topics": ["topic1", "topic2"], "covered": ["topic1"], "missing": ["topic2"]}}"""

JUDGE_FLASHCARD_PROMPT = """\
You are evaluating the quality of a study flashcard.

Question: {question}
Answer: {answer}

Score this flashcard from 1-10:
- 9-10: Clear, specific question with accurate, complete answer
- 7-8: Good question and answer with minor room for improvement
- 5-6: Acceptable but could be more specific or accurate
- 3-4: Vague, ambiguous, or partially incorrect
- 1-2: Misleading, trivial, or unanswerable

Respond with ONLY a JSON object:
{{"score": 8, "reason": "brief explanation"}}"""

JUDGE_CONFLICT_PROMPT = """\
You are evaluating whether a detected conflict between sources is genuine.

Conflict topic: {topic}
Source A: {source_a_title} claims: {source_a_claim}
Source B: {source_b_title} claims: {source_b_claim}
Assessment: {assessment}

Is this a genuine disagreement between sources, or a false positive (e.g., different contexts, compatible claims, or misinterpretation)?

Respond with ONLY a JSON object:
{{"genuine": true, "reason": "brief explanation"}}
or
{{"genuine": false, "reason": "brief explanation"}}"""

JUDGE_ASSUMPTION_PROMPT = """\
You are evaluating whether a surfaced assumption is genuinely hidden and meaningful.

Assumption: {assumption}
Why it matters: {why_it_matters}
Sources relying on it: {sources_relying}
Risk level: {risk_level}

Is this a genuinely hidden assumption that could impact conclusions if wrong? Or is it obvious, trivial, or not actually an assumption?

Respond with ONLY a JSON object:
{{"valid": true, "reason": "brief explanation"}}
or
{{"valid": false, "reason": "brief explanation"}}"""
