"""Tests for beacon.evaluation.ab_test — A/B testing for synthesis prompts."""
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from beacon.evaluation.ab_test import (
    compare_reports,
    pick_winner,
    re_synthesize,
    run_ab_test,
    run_ab_suite,
)
from beacon.evaluation.models import (
    ABTestResult,
    ABTestSuite,
    AssumptionQualityResult,
    CitationAccuracyResult,
    ConflictQualityResult,
    ContentCompletenessResult,
    FlashcardQualityResult,
    GroundednessResult,
    MetricDelta,
    PromptVariant,
    SynthesisEvalReport,
    TimelineValidityResult,
)
from beacon.models import ResearchResult


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_synth_report(
    groundedness: float = 0.8,
    completeness: float = 0.7,
    flashcard_quality: float = 4.0,
) -> SynthesisEvalReport:
    """Build a SynthesisEvalReport with controllable metric values."""
    return SynthesisEvalReport(
        citation_accuracy=CitationAccuracyResult(
            total_citations=10, valid_indices=8,
            invalid_indices=[99], support_scores=[],
        ),
        groundedness=GroundednessResult(
            total_claims=10, grounded_count=int(groundedness * 10),
            groundedness_ratio=groundedness, details=[],
        ),
        content_completeness=ContentCompletenessResult(
            key_topics=["a", "b"], covered=["a"], missing=["b"],
            completeness_ratio=completeness,
        ),
        flashcard_quality=FlashcardQualityResult(
            mean_score=flashcard_quality, individual_scores=[],
        ),
        timeline_validity=TimelineValidityResult(
            total_events=3, has_dates=3, chronological=True,
            significance_distribution={"high": 1, "medium": 2}, issues=[],
        ),
        conflict_quality=ConflictQualityResult(
            total=2, genuine=2, false_positive=0, details=[],
        ),
        assumption_quality=AssumptionQualityResult(
            total=2, valid=2, invalid=0, details=[],
        ),
    )


@pytest.fixture
def sample_variant() -> PromptVariant:
    return PromptVariant(
        name="test_variant",
        artifact_type="summary",
        prompt_template="Custom prompt: {context}",
    )


# ---------------------------------------------------------------------------
# TestCompareReports
# ---------------------------------------------------------------------------

class TestCompareReports:
    def test_computes_deltas_for_shared_metrics(self):
        baseline = _make_synth_report(groundedness=0.8, completeness=0.7)
        variant = _make_synth_report(groundedness=0.9, completeness=0.6)
        deltas = compare_reports(baseline, variant)

        assert len(deltas) > 0
        by_metric = {d.metric: d for d in deltas}

        assert "groundedness_ratio" in by_metric
        g = by_metric["groundedness_ratio"]
        assert g.baseline == 0.8
        assert g.variant == 0.9
        assert g.delta == pytest.approx(0.1, abs=0.001)

        assert "content_completeness" in by_metric
        c = by_metric["content_completeness"]
        assert c.delta == pytest.approx(-0.1, abs=0.001)

    def test_pct_change_with_nonzero_baseline(self):
        baseline = _make_synth_report(groundedness=0.5)
        variant = _make_synth_report(groundedness=1.0)
        deltas = compare_reports(baseline, variant)
        by_metric = {d.metric: d for d in deltas}
        assert by_metric["groundedness_ratio"].pct_change == pytest.approx(100.0)

    def test_pct_change_with_zero_baseline_same(self):
        baseline = _make_synth_report(groundedness=0.0)
        variant = _make_synth_report(groundedness=0.0)
        deltas = compare_reports(baseline, variant)
        by_metric = {d.metric: d for d in deltas}
        assert by_metric["groundedness_ratio"].pct_change == 0.0

    def test_empty_reports_produce_no_deltas(self):
        baseline = SynthesisEvalReport()
        variant = SynthesisEvalReport()
        deltas = compare_reports(baseline, variant)
        assert deltas == []


# ---------------------------------------------------------------------------
# TestPickWinner
# ---------------------------------------------------------------------------

class TestPickWinner:
    def test_variant_wins_majority(self):
        deltas = [
            MetricDelta(metric="a", baseline=0.5, variant=0.8, delta=0.3, pct_change=60),
            MetricDelta(metric="b", baseline=0.5, variant=0.7, delta=0.2, pct_change=40),
            MetricDelta(metric="c", baseline=0.5, variant=0.4, delta=-0.1, pct_change=-20),
        ]
        assert pick_winner(deltas) == "variant"

    def test_baseline_wins_majority(self):
        deltas = [
            MetricDelta(metric="a", baseline=0.8, variant=0.5, delta=-0.3, pct_change=-37.5),
            MetricDelta(metric="b", baseline=0.7, variant=0.5, delta=-0.2, pct_change=-28.57),
            MetricDelta(metric="c", baseline=0.4, variant=0.5, delta=0.1, pct_change=25),
        ]
        assert pick_winner(deltas) == "baseline"

    def test_tie_equal_improvements(self):
        deltas = [
            MetricDelta(metric="a", baseline=0.5, variant=0.6, delta=0.1, pct_change=20),
            MetricDelta(metric="b", baseline=0.5, variant=0.4, delta=-0.1, pct_change=-20),
        ]
        assert pick_winner(deltas) == "tie"

    def test_empty_deltas_is_tie(self):
        assert pick_winner([]) == "tie"

    def test_all_unchanged_is_tie(self):
        deltas = [
            MetricDelta(metric="a", baseline=0.5, variant=0.5, delta=0.0, pct_change=0),
            MetricDelta(metric="b", baseline=0.5, variant=0.5, delta=0.0, pct_change=0),
        ]
        assert pick_winner(deltas) == "tie"


# ---------------------------------------------------------------------------
# TestReSynthesize
# ---------------------------------------------------------------------------

class TestReSynthesize:
    @pytest.mark.asyncio
    async def test_calls_synthesize_with_overrides(self, golden_research_result):
        """re_synthesize passes prompt_overrides to synthesize()."""
        mock_artifacts = {
            "summary": "new summary",
            "concept_map": "new map",
            "flashcards": [],
            "timeline": [],
            "conflicts": [],
            "assumptions": [],
            "resources": [],
        }
        client = AsyncMock()
        overrides = {"summary": "Custom: {context}"}

        with patch(
            "beacon.evaluation.ab_test.synthesize",
            new_callable=AsyncMock,
            return_value=mock_artifacts,
        ) as mock_synth:
            new_result = await re_synthesize(golden_research_result, client, overrides)

            mock_synth.assert_called_once_with(
                sources=golden_research_result.sources,
                topic=golden_research_result.topic,
                depth=golden_research_result.depth,
                client=client,
                prompt_overrides=overrides,
            )

        assert isinstance(new_result, ResearchResult)
        assert new_result.artifacts["summary"] == "new summary"
        assert new_result.sources == golden_research_result.sources
        assert new_result.topic == golden_research_result.topic

    @pytest.mark.asyncio
    async def test_preserves_metadata(self, golden_research_result):
        """re_synthesize keeps session_id, topic, depth, timestamp."""
        mock_artifacts = {
            "summary": "s", "concept_map": "c", "flashcards": [],
            "timeline": [], "conflicts": [], "assumptions": [],
            "resources": [],
        }
        client = AsyncMock()

        with patch(
            "beacon.evaluation.ab_test.synthesize",
            new_callable=AsyncMock,
            return_value=mock_artifacts,
        ):
            new_result = await re_synthesize(golden_research_result, client, {})

        assert new_result.session_id == golden_research_result.session_id
        assert new_result.timestamp == golden_research_result.timestamp
        assert new_result.depth == golden_research_result.depth


# ---------------------------------------------------------------------------
# TestRunABTest
# ---------------------------------------------------------------------------

class TestRunABTest:
    @pytest.mark.asyncio
    async def test_end_to_end_mocked(self, golden_research_result, sample_variant):
        """Mocked end-to-end: re-synth + eval + compare."""
        baseline_report = _make_synth_report(groundedness=0.8, completeness=0.7)
        variant_report = _make_synth_report(groundedness=0.9, completeness=0.8)

        client = AsyncMock()

        with patch(
            "beacon.evaluation.ab_test.re_synthesize",
            new_callable=AsyncMock,
            return_value=golden_research_result,
        ), patch(
            "beacon.evaluation.ab_test.run_synthesis_eval",
            new_callable=AsyncMock,
            side_effect=[baseline_report, variant_report],
        ):
            result = await run_ab_test(golden_research_result, sample_variant, client)

        assert isinstance(result, ABTestResult)
        assert result.variant == sample_variant
        assert result.baseline_report == baseline_report
        assert result.variant_report == variant_report
        assert len(result.deltas) > 0
        assert result.winner == "variant"  # variant improved both metrics


# ---------------------------------------------------------------------------
# TestRunABSuite
# ---------------------------------------------------------------------------

class TestRunABSuite:
    @pytest.mark.asyncio
    async def test_runs_multiple_variants(self, golden_research_result):
        """Suite runs one test per variant and collects results."""
        variants = [
            PromptVariant(name="v1", artifact_type="summary", prompt_template="P1: {context}"),
            PromptVariant(name="v2", artifact_type="flashcards", prompt_template="P2: {context}"),
        ]

        baseline_report = _make_synth_report()
        variant_report = _make_synth_report()
        client = AsyncMock()

        with patch(
            "beacon.evaluation.ab_test.re_synthesize",
            new_callable=AsyncMock,
            return_value=golden_research_result,
        ), patch(
            "beacon.evaluation.ab_test.run_synthesis_eval",
            new_callable=AsyncMock,
            return_value=baseline_report,
        ):
            suite = await run_ab_suite(golden_research_result, variants, client)

        assert isinstance(suite, ABTestSuite)
        assert suite.topic == golden_research_result.topic
        assert suite.num_sources == len(golden_research_result.sources)
        assert len(suite.results) == 2
        assert suite.results[0].variant.name == "v1"
        assert suite.results[1].variant.name == "v2"
