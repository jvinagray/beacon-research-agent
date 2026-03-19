"""RAG retrieval metrics: automated and LLM-as-judge evaluations."""
import math
import re
import statistics
from typing import Any

from anthropic import AsyncAnthropic

from beacon.evaluation.llm_judge import judge, judge_batch
from beacon.evaluation.models import (
    CoverageCompletenessResult,
    ContentTypeAccuracyResult,
    ExtractionSuccessResult,
    KeyInsightQualityResult,
    PrecisionAtKResult,
    RelevanceCorrelationResult,
    ScoreDistributionResult,
)
from beacon.evaluation.prompts import (
    JUDGE_CONTENT_TYPE_PROMPT,
    JUDGE_COVERAGE_PROMPT,
    JUDGE_KEY_INSIGHT_PROMPT,
    JUDGE_RELEVANCE_PROMPT,
)
from beacon.models import EvaluatedSource


# ---------------------------------------------------------------------------
# Automated metrics (pure functions, no client needed)
# ---------------------------------------------------------------------------

def compute_score_distribution(sources: list[EvaluatedSource]) -> ScoreDistributionResult:
    """Compute statistics on learning_efficiency_score distribution."""
    scores = [s.signals.learning_efficiency_score for s in sources]

    if not scores:
        return ScoreDistributionResult(
            mean=0.0, std=0.0, min_score=0, max_score=0,
            histogram={}, calibration_notes=["No sources to evaluate"],
        )

    mean = statistics.mean(scores)
    std = statistics.pstdev(scores)
    histogram: dict[int, int] = {}
    for s in scores:
        histogram[s] = histogram.get(s, 0) + 1

    notes: list[str] = []
    if mean > 8:
        notes.append("Scores skew high — possible leniency bias")
    if mean < 4:
        notes.append("Scores skew low — topic may be poorly covered online")
    if std < 1.0 and len(scores) > 3:
        notes.append("Very low variance — scores may not be well calibrated")
    if all(s == scores[0] for s in scores):
        notes.append("All scores identical — likely evaluation issue")

    return ScoreDistributionResult(
        mean=round(mean, 2),
        std=round(std, 2),
        min_score=min(scores),
        max_score=max(scores),
        histogram=histogram,
        calibration_notes=notes,
    )


def compute_extraction_success(sources: list[EvaluatedSource]) -> ExtractionSuccessResult:
    """Compute fraction of sources with deep_read_content by method."""
    total = len(sources)
    success_count = 0
    by_method: dict[str, int] = {}

    for s in sources:
        if s.deep_read_content is not None:
            success_count += 1
            method = s.extraction_method or "unknown"
            by_method[method] = by_method.get(method, 0) + 1

    return ExtractionSuccessResult(
        total=total,
        success_count=success_count,
        rate=round(success_count / total, 4) if total > 0 else 0.0,
        by_method=by_method,
    )


def compute_relevance_correlation(
    sources: list[EvaluatedSource],
    summary: str,
) -> RelevanceCorrelationResult:
    """Pearson correlation between learning_efficiency_score and cite:N count in summary."""
    # Count citations per source index (1-based)
    cite_pattern = re.compile(r"\[.*?\]\(cite:(\d+)\)")
    cite_count_map: dict[int, int] = {}
    for match in cite_pattern.finditer(summary):
        idx = int(match.group(1))
        cite_count_map[idx] = cite_count_map.get(idx, 0) + 1

    scores: list[int] = []
    cite_counts: list[int] = []
    for i, s in enumerate(sources):
        scores.append(s.signals.learning_efficiency_score)
        cite_counts.append(cite_count_map.get(i + 1, 0))

    n = len(scores)
    if n < 2:
        return RelevanceCorrelationResult(
            correlation=None, cite_counts=cite_counts, scores=scores,
            note="Not enough data points for correlation",
        )

    # Manual Pearson correlation
    sum_x = sum(scores)
    sum_y = sum(cite_counts)
    sum_xy = sum(x * y for x, y in zip(scores, cite_counts))
    sum_x2 = sum(x * x for x in scores)
    sum_y2 = sum(y * y for y in cite_counts)

    denominator = math.sqrt(
        (n * sum_x2 - sum_x ** 2) * (n * sum_y2 - sum_y ** 2)
    )

    if denominator == 0:
        return RelevanceCorrelationResult(
            correlation=None, cite_counts=cite_counts, scores=scores,
            note="Zero variance in scores or citations — correlation undefined",
        )

    r = (n * sum_xy - sum_x * sum_y) / denominator

    note = ""
    if r > 0.5:
        note = "Positive correlation: higher-scored sources are cited more"
    elif r < -0.3:
        note = "Negative correlation: higher-scored sources are cited less (unusual)"
    else:
        note = "Weak or no correlation between score and citation frequency"

    return RelevanceCorrelationResult(
        correlation=round(r, 4),
        cite_counts=cite_counts,
        scores=scores,
        note=note,
    )


# ---------------------------------------------------------------------------
# LLM-as-judge metrics (async, require client)
# ---------------------------------------------------------------------------

async def compute_precision_at_k(
    sources: list[EvaluatedSource],
    topic: str,
    k: int,
    client: AsyncAnthropic,
) -> PrecisionAtKResult:
    """Judge relevance of top-K sources to the topic."""
    top_k = sources[:k]
    prompts = [
        JUDGE_RELEVANCE_PROMPT.format(
            topic=topic, title=s.title, url=s.url, snippet=s.snippet,
        )
        for s in top_k
    ]

    results = await judge_batch(prompts, client)

    relevance_list: list[dict[str, Any]] = []
    relevant_count = 0
    for s, r in zip(top_k, results):
        is_relevant = r.get("relevant", False)
        if is_relevant:
            relevant_count += 1
        relevance_list.append({
            "title": s.title,
            "relevant": is_relevant,
            "reason": r.get("reason", ""),
        })

    total = len(top_k)
    return PrecisionAtKResult(
        k=k,
        relevant_count=relevant_count,
        total=total,
        precision=round(relevant_count / total, 4) if total > 0 else 0.0,
        source_relevance=relevance_list,
    )


async def compute_content_type_accuracy(
    sources: list[EvaluatedSource],
    client: AsyncAnthropic,
) -> ContentTypeAccuracyResult:
    """Compare pipeline's content_type with independent LLM classification."""
    prompts = [
        JUDGE_CONTENT_TYPE_PROMPT.format(
            title=s.title, url=s.url, snippet=s.snippet,
        )
        for s in sources
    ]

    results = await judge_batch(prompts, client)

    details: list[dict[str, Any]] = []
    matches = 0
    for s, r in zip(sources, results):
        llm_type = r.get("content_type", "other")
        pipeline_type = s.signals.content_type
        is_match = llm_type == pipeline_type
        if is_match:
            matches += 1
        details.append({
            "title": s.title,
            "pipeline_type": pipeline_type,
            "llm_type": llm_type,
            "match": is_match,
        })

    total = len(sources)
    return ContentTypeAccuracyResult(
        total=total,
        matches=matches,
        accuracy=round(matches / total, 4) if total > 0 else 0.0,
        details=details,
    )


async def compute_key_insight_quality(
    sources: list[EvaluatedSource],
    client: AsyncAnthropic,
) -> KeyInsightQualityResult:
    """Score each source's key_insight quality via LLM judge."""
    prompts = [
        JUDGE_KEY_INSIGHT_PROMPT.format(
            title=s.title, snippet=s.snippet,
            key_insight=s.signals.key_insight,
        )
        for s in sources
    ]

    results = await judge_batch(prompts, client)

    individual: list[dict[str, Any]] = []
    scores_list: list[float] = []
    for s, r in zip(sources, results):
        score = r.get("score", 5)
        scores_list.append(score)
        individual.append({
            "title": s.title,
            "score": score,
            "reason": r.get("reason", ""),
        })

    mean_score = sum(scores_list) / len(scores_list) if scores_list else 0.0
    return KeyInsightQualityResult(
        mean_score=round(mean_score, 2),
        individual_scores=individual,
    )


async def compute_coverage_completeness(
    sources: list[EvaluatedSource],
    topic: str,
    client: AsyncAnthropic,
) -> CoverageCompletenessResult:
    """Check if source coverages span expected subtopics for the topic."""
    # Step 1: Ask LLM for expected subtopics
    coverage_prompt = JUDGE_COVERAGE_PROMPT.format(topic=topic)
    result = await judge(coverage_prompt, client)
    expected = result.get("subtopics", [])

    # Step 2: Collect all coverage items from sources
    all_coverage: set[str] = set()
    for s in sources:
        for item in s.signals.coverage:
            all_coverage.add(item.lower())

    # Step 3: Check which expected subtopics are covered
    covered: list[str] = []
    missing: list[str] = []
    for subtopic in expected:
        subtopic_lower = subtopic.lower()
        # Fuzzy match: check if any coverage item contains the subtopic or vice versa
        found = any(
            subtopic_lower in c or c in subtopic_lower
            for c in all_coverage
        )
        if found:
            covered.append(subtopic)
        else:
            missing.append(subtopic)

    total = len(expected)
    return CoverageCompletenessResult(
        expected_subtopics=expected,
        covered_subtopics=covered,
        missing_subtopics=missing,
        coverage_ratio=round(len(covered) / total, 4) if total > 0 else 0.0,
    )
