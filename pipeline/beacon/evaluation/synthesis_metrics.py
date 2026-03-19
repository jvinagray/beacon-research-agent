"""Synthesis quality metrics: automated and LLM-as-judge evaluations."""
import re
from typing import Any

from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError

from beacon.evaluation.llm_judge import judge, judge_batch
from beacon.evaluation.models import (
    AssumptionQualityResult,
    CitationAccuracyResult,
    ConflictQualityResult,
    ContentCompletenessResult,
    FlashcardQualityResult,
    GroundednessResult,
    StructuralComplianceResult,
    TimelineValidityResult,
)
from beacon.evaluation.prompts import (
    JUDGE_ASSUMPTION_PROMPT,
    JUDGE_CITATION_SUPPORT_PROMPT,
    JUDGE_COMPLETENESS_PROMPT,
    JUDGE_CONFLICT_PROMPT,
    JUDGE_FLASHCARD_PROMPT,
    JUDGE_GROUNDEDNESS_PROMPT,
)
from beacon.models import EvaluatedSource


# ---------------------------------------------------------------------------
# Internal validation schemas for structured artifacts
# ---------------------------------------------------------------------------

class TimelineEventSchema(BaseModel):
    """Expected shape of a timeline event."""
    date: str
    title: str
    description: str
    source_title: str
    significance: str


class ConflictSchema(BaseModel):
    """Expected shape of a detected conflict."""
    topic: str
    source_a: dict[str, str]
    source_b: dict[str, str]
    assessment: str


class AssumptionSchema(BaseModel):
    """Expected shape of a surfaced assumption."""
    assumption: str
    why_it_matters: str
    sources_relying: list[str]
    risk_level: str


# Schema registry mapping artifact types to their validation model
_SCHEMAS: dict[str, type[BaseModel]] = {
    "timeline": TimelineEventSchema,
    "conflicts": ConflictSchema,
    "assumptions": AssumptionSchema,
}


# ---------------------------------------------------------------------------
# Automated metrics (pure functions, no client needed)
# ---------------------------------------------------------------------------

def check_citation_indices(summary: str, num_sources: int) -> tuple[int, int, list[int]]:
    """Parse cite:N references and check if indices are in valid range [1, num_sources].

    Returns (total_citations, valid_count, invalid_indices).
    """
    cite_pattern = re.compile(r"\[.*?\]\(cite:(\d+)\)")
    indices = [int(m.group(1)) for m in cite_pattern.finditer(summary)]

    valid = 0
    invalid: list[int] = []
    for idx in indices:
        if 1 <= idx <= num_sources:
            valid += 1
        else:
            if idx not in invalid:
                invalid.append(idx)

    return len(indices), valid, invalid


def check_structural_compliance(
    artifact_type: str,
    items: list[dict[str, Any]],
) -> StructuralComplianceResult:
    """Validate a list of artifact dicts against the expected Pydantic schema."""
    schema = _SCHEMAS.get(artifact_type)
    if schema is None:
        return StructuralComplianceResult(
            artifact_type=artifact_type, total=len(items),
            valid=0, invalid=len(items),
            errors=[f"Unknown artifact type: {artifact_type}"],
        )

    valid = 0
    invalid = 0
    errors: list[str] = []

    for i, item in enumerate(items):
        try:
            schema.model_validate(item)
            valid += 1
        except ValidationError as e:
            invalid += 1
            errors.append(f"Item {i}: {e.error_count()} validation error(s) — {e.errors()[0]['msg']}")

    return StructuralComplianceResult(
        artifact_type=artifact_type,
        total=len(items),
        valid=valid,
        invalid=invalid,
        errors=errors,
    )


def check_timeline_validity(events: list[dict[str, Any]]) -> TimelineValidityResult:
    """Check timeline events for dates, chronological order, and significance distribution."""
    if not events:
        return TimelineValidityResult(
            total_events=0, has_dates=0, chronological=True,
            significance_distribution={}, issues=[],
        )

    has_dates = 0
    issues: list[str] = []
    sig_dist: dict[str, int] = {}
    date_strs: list[str] = []

    for i, event in enumerate(events):
        date_val = event.get("date", "")
        if date_val:
            has_dates += 1
            date_strs.append(date_val)
        else:
            issues.append(f"Event {i} missing date")

        sig = event.get("significance", "unknown")
        sig_dist[sig] = sig_dist.get(sig, 0) + 1

    # Check chronological order by string comparison (works for ISO-like dates)
    chronological = True
    for i in range(1, len(date_strs)):
        if date_strs[i] < date_strs[i - 1]:
            chronological = False
            issues.append(
                f"Non-chronological: '{date_strs[i]}' comes after '{date_strs[i-1]}'"
            )
            break

    valid_sig = {"high", "medium", "low"}
    for sig in sig_dist:
        if sig not in valid_sig:
            issues.append(f"Invalid significance value: '{sig}'")

    return TimelineValidityResult(
        total_events=len(events),
        has_dates=has_dates,
        chronological=chronological,
        significance_distribution=sig_dist,
        issues=issues,
    )


# ---------------------------------------------------------------------------
# LLM-as-judge metrics (async, require client)
# ---------------------------------------------------------------------------

async def compute_citation_accuracy(
    summary: str,
    sources: list[EvaluatedSource],
    client: AsyncAnthropic,
) -> CitationAccuracyResult:
    """Check citation index validity and verify LLM support for cited claims."""
    num_sources = len(sources)
    total_citations, valid_count, invalid_indices = check_citation_indices(
        summary, num_sources
    )

    # Extract (claim_text, source_index) pairs for valid citations
    cite_pattern = re.compile(r"([^.!?\n]+?)\s*\[.*?\]\(cite:(\d+)\)")
    claim_pairs: list[tuple[str, int]] = []
    for match in cite_pattern.finditer(summary):
        claim_text = match.group(1).strip()
        idx = int(match.group(2))
        if 1 <= idx <= num_sources:
            claim_pairs.append((claim_text, idx))

    # Judge support for a sample (up to 10 to manage cost)
    sample = claim_pairs[:10]
    support_scores: list[dict[str, Any]] = []

    if sample:
        prompts = [
            JUDGE_CITATION_SUPPORT_PROMPT.format(
                claim=claim,
                source_title=sources[idx - 1].title,
                source_content=(
                    sources[idx - 1].deep_read_content
                    or sources[idx - 1].snippet
                )[:2000],
            )
            for claim, idx in sample
        ]
        results = await judge_batch(prompts, client)

        for (claim, idx), r in zip(sample, results):
            support_scores.append({
                "claim": claim,
                "source_index": idx,
                "source_title": sources[idx - 1].title,
                "supported": r.get("supported", False),
                "reason": r.get("reason", ""),
            })

    return CitationAccuracyResult(
        total_citations=total_citations,
        valid_indices=valid_count,
        invalid_indices=invalid_indices,
        support_scores=support_scores,
    )


async def compute_groundedness(
    summary: str,
    sources: list[EvaluatedSource],
    client: AsyncAnthropic,
) -> GroundednessResult:
    """Extract claims per paragraph and judge groundedness against sources."""
    # Split summary into paragraphs (skip headings and empty lines)
    paragraphs = [
        p.strip() for p in summary.split("\n\n")
        if p.strip() and not p.strip().startswith("#")
    ]

    # Build sources text for the judge
    sources_text = "\n\n".join(
        f"Source {i+1} ({s.title}): {(s.deep_read_content or s.snippet)[:1500]}"
        for i, s in enumerate(sources)
    )

    # Judge each paragraph (up to 5 to manage cost)
    sample_paragraphs = paragraphs[:5]
    prompts = [
        JUDGE_GROUNDEDNESS_PROMPT.format(
            paragraph=para, sources_text=sources_text,
        )
        for para in sample_paragraphs
    ]

    results = await judge_batch(prompts, client)

    all_claims: list[dict[str, Any]] = []
    grounded_count = 0
    total_claims = 0

    for r in results:
        claims = r.get("claims", [])
        for claim in claims:
            total_claims += 1
            is_grounded = claim.get("grounded", False)
            if is_grounded:
                grounded_count += 1
            all_claims.append(claim)

    return GroundednessResult(
        total_claims=total_claims,
        grounded_count=grounded_count,
        groundedness_ratio=round(
            grounded_count / total_claims, 4
        ) if total_claims > 0 else 0.0,
        details=all_claims,
    )


async def compute_content_completeness(
    summary: str,
    sources: list[EvaluatedSource],
    topic: str,
    client: AsyncAnthropic,
) -> ContentCompletenessResult:
    """Check if the summary covers key topics from source insights."""
    insights = "\n".join(
        f"- {s.title}: {s.signals.key_insight}"
        for s in sources
    )

    prompt = JUDGE_COMPLETENESS_PROMPT.format(
        topic=topic, insights=insights, summary=summary[:3000],
    )
    result = await judge(prompt, client)

    key_topics = result.get("key_topics", [])
    covered = result.get("covered", [])
    missing = result.get("missing", [])

    total = len(key_topics)
    return ContentCompletenessResult(
        key_topics=key_topics,
        covered=covered,
        missing=missing,
        completeness_ratio=round(len(covered) / total, 4) if total > 0 else 0.0,
    )


async def compute_flashcard_quality(
    flashcards: list[dict[str, str]],
    client: AsyncAnthropic,
) -> FlashcardQualityResult:
    """Score each flashcard's quality via LLM judge."""
    if not flashcards:
        return FlashcardQualityResult(mean_score=0.0, individual_scores=[])

    prompts = [
        JUDGE_FLASHCARD_PROMPT.format(
            question=fc.get("question", ""),
            answer=fc.get("answer", ""),
        )
        for fc in flashcards
    ]

    results = await judge_batch(prompts, client)

    individual: list[dict[str, Any]] = []
    scores: list[float] = []
    for fc, r in zip(flashcards, results):
        score = r.get("score", 5)
        scores.append(score)
        individual.append({
            "question": fc.get("question", ""),
            "score": score,
            "reason": r.get("reason", ""),
        })

    mean = sum(scores) / len(scores) if scores else 0.0
    return FlashcardQualityResult(
        mean_score=round(mean, 2),
        individual_scores=individual,
    )


async def compute_conflict_quality(
    conflicts: list[dict[str, Any]],
    client: AsyncAnthropic,
) -> ConflictQualityResult:
    """Judge whether detected conflicts are genuine disagreements."""
    if not conflicts:
        return ConflictQualityResult(
            total=0, genuine=0, false_positive=0, details=[],
        )

    prompts = [
        JUDGE_CONFLICT_PROMPT.format(
            topic=c.get("topic", ""),
            source_a_title=c.get("source_a", {}).get("title", ""),
            source_a_claim=c.get("source_a", {}).get("claim", ""),
            source_b_title=c.get("source_b", {}).get("title", ""),
            source_b_claim=c.get("source_b", {}).get("claim", ""),
            assessment=c.get("assessment", ""),
        )
        for c in conflicts
    ]

    results = await judge_batch(prompts, client)

    genuine = 0
    false_positive = 0
    details: list[dict[str, Any]] = []
    for c, r in zip(conflicts, results):
        is_genuine = r.get("genuine", False)
        if is_genuine:
            genuine += 1
        else:
            false_positive += 1
        details.append({
            "topic": c.get("topic", ""),
            "genuine": is_genuine,
            "reason": r.get("reason", ""),
        })

    return ConflictQualityResult(
        total=len(conflicts),
        genuine=genuine,
        false_positive=false_positive,
        details=details,
    )


async def compute_assumption_quality(
    assumptions: list[dict[str, Any]],
    client: AsyncAnthropic,
) -> AssumptionQualityResult:
    """Judge whether surfaced assumptions are genuinely hidden and meaningful."""
    if not assumptions:
        return AssumptionQualityResult(
            total=0, valid=0, invalid=0, details=[],
        )

    prompts = [
        JUDGE_ASSUMPTION_PROMPT.format(
            assumption=a.get("assumption", ""),
            why_it_matters=a.get("why_it_matters", ""),
            sources_relying=", ".join(a.get("sources_relying", [])),
            risk_level=a.get("risk_level", ""),
        )
        for a in assumptions
    ]

    results = await judge_batch(prompts, client)

    valid = 0
    invalid = 0
    details: list[dict[str, Any]] = []
    for a, r in zip(assumptions, results):
        is_valid = r.get("valid", False)
        if is_valid:
            valid += 1
        else:
            invalid += 1
        details.append({
            "assumption": a.get("assumption", ""),
            "valid": is_valid,
            "reason": r.get("reason", ""),
        })

    return AssumptionQualityResult(
        total=len(assumptions),
        valid=valid,
        invalid=invalid,
        details=details,
    )
