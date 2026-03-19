"""Evaluation result models: Pydantic models for all metric results and reports."""
from pydantic import BaseModel, Field
from typing import Any


# ---------------------------------------------------------------------------
# RAG Metric Results
# ---------------------------------------------------------------------------

class PrecisionAtKResult(BaseModel):
    """Precision@K: fraction of top-K sources judged relevant."""
    k: int
    relevant_count: int
    total: int
    precision: float
    source_relevance: list[dict[str, Any]] = Field(default_factory=list)


class ScoreDistributionResult(BaseModel):
    """Statistics on learning_efficiency_score distribution."""
    mean: float
    std: float
    min_score: int
    max_score: int
    histogram: dict[int, int] = Field(default_factory=dict)
    calibration_notes: list[str] = Field(default_factory=list)


class ContentTypeAccuracyResult(BaseModel):
    """Pipeline content_type vs independent LLM classification."""
    total: int
    matches: int
    accuracy: float
    details: list[dict[str, Any]] = Field(default_factory=list)


class KeyInsightQualityResult(BaseModel):
    """LLM-judged quality of key_insight per source."""
    mean_score: float
    individual_scores: list[dict[str, Any]] = Field(default_factory=list)


class CoverageCompletenessResult(BaseModel):
    """Do source coverages span expected subtopics?"""
    expected_subtopics: list[str] = Field(default_factory=list)
    covered_subtopics: list[str] = Field(default_factory=list)
    missing_subtopics: list[str] = Field(default_factory=list)
    coverage_ratio: float


class ExtractionSuccessResult(BaseModel):
    """Fraction of sources with deep_read_content by method."""
    total: int
    success_count: int
    rate: float
    by_method: dict[str, int] = Field(default_factory=dict)


class RelevanceCorrelationResult(BaseModel):
    """Pearson correlation between score and citation count."""
    correlation: float | None
    cite_counts: list[int] = Field(default_factory=list)
    scores: list[int] = Field(default_factory=list)
    note: str = ""


class RAGEvalReport(BaseModel):
    """Aggregated RAG evaluation report."""
    precision_at_k: PrecisionAtKResult | None = None
    score_distribution: ScoreDistributionResult | None = None
    content_type_accuracy: ContentTypeAccuracyResult | None = None
    key_insight_quality: KeyInsightQualityResult | None = None
    coverage_completeness: CoverageCompletenessResult | None = None
    extraction_success: ExtractionSuccessResult | None = None
    relevance_correlation: RelevanceCorrelationResult | None = None


# ---------------------------------------------------------------------------
# Synthesis Metric Results
# ---------------------------------------------------------------------------

class CitationAccuracyResult(BaseModel):
    """Citation index validity + LLM support verification."""
    total_citations: int
    valid_indices: int
    invalid_indices: list[int] = Field(default_factory=list)
    support_scores: list[dict[str, Any]] = Field(default_factory=list)


class GroundednessResult(BaseModel):
    """Factual groundedness of summary claims."""
    total_claims: int
    grounded_count: int
    groundedness_ratio: float
    details: list[dict[str, Any]] = Field(default_factory=list)


class StructuralComplianceResult(BaseModel):
    """Schema validation for structured artifacts."""
    artifact_type: str
    total: int
    valid: int
    invalid: int
    errors: list[str] = Field(default_factory=list)


class ContentCompletenessResult(BaseModel):
    """Does summary cover key topics from sources?"""
    key_topics: list[str] = Field(default_factory=list)
    covered: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    completeness_ratio: float


class FlashcardQualityResult(BaseModel):
    """LLM-judged flashcard quality."""
    mean_score: float
    individual_scores: list[dict[str, Any]] = Field(default_factory=list)


class TimelineValidityResult(BaseModel):
    """Timeline structural checks."""
    total_events: int
    has_dates: int
    chronological: bool
    significance_distribution: dict[str, int] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)


class ConflictQualityResult(BaseModel):
    """LLM-judged conflict quality."""
    total: int
    genuine: int
    false_positive: int
    details: list[dict[str, Any]] = Field(default_factory=list)


class AssumptionQualityResult(BaseModel):
    """LLM-judged assumption quality."""
    total: int
    valid: int
    invalid: int
    details: list[dict[str, Any]] = Field(default_factory=list)


class SynthesisEvalReport(BaseModel):
    """Aggregated synthesis evaluation report."""
    citation_accuracy: CitationAccuracyResult | None = None
    groundedness: GroundednessResult | None = None
    structural_compliance: list[StructuralComplianceResult] = Field(default_factory=list)
    content_completeness: ContentCompletenessResult | None = None
    flashcard_quality: FlashcardQualityResult | None = None
    timeline_validity: TimelineValidityResult | None = None
    conflict_quality: ConflictQualityResult | None = None
    assumption_quality: AssumptionQualityResult | None = None


# ---------------------------------------------------------------------------
# Combined Report
# ---------------------------------------------------------------------------

class FullEvalReport(BaseModel):
    """Complete evaluation report combining RAG and synthesis metrics."""
    topic: str
    rag: RAGEvalReport
    synthesis: SynthesisEvalReport
    timestamp: str


# ---------------------------------------------------------------------------
# A/B Test Models
# ---------------------------------------------------------------------------

class PromptVariant(BaseModel):
    """A named prompt variant for A/B testing."""
    name: str
    artifact_type: str
    prompt_template: str


class MetricDelta(BaseModel):
    """Change in a single metric between baseline and variant."""
    metric: str
    baseline: float
    variant: float
    delta: float
    pct_change: float


class ABTestResult(BaseModel):
    """Result of comparing one variant against the baseline."""
    variant: PromptVariant
    baseline_report: SynthesisEvalReport
    variant_report: SynthesisEvalReport
    deltas: list[MetricDelta]
    winner: str  # "baseline" | "variant" | "tie"


class ABTestSuite(BaseModel):
    """Collection of A/B test results for a single research topic."""
    topic: str
    num_sources: int
    results: list[ABTestResult]
    timestamp: str
