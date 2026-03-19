"""Tests for RAG retrieval metrics."""
import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from beacon.evaluation.rag_metrics import (
    compute_content_type_accuracy,
    compute_coverage_completeness,
    compute_extraction_success,
    compute_key_insight_quality,
    compute_precision_at_k,
    compute_relevance_correlation,
    compute_score_distribution,
)
from tests.test_evaluation.conftest import make_judge_response


# ---------------------------------------------------------------------------
# Automated metrics
# ---------------------------------------------------------------------------

class TestScoreDistribution:
    """Tests for compute_score_distribution."""

    def test_basic_statistics(self, golden_evaluated_sources):
        result = compute_score_distribution(golden_evaluated_sources)
        assert result.mean == 6.8  # (9+7+8+6+4) / 5
        assert result.min_score == 4
        assert result.max_score == 9
        assert sum(result.histogram.values()) == 5

    def test_empty_sources(self):
        result = compute_score_distribution([])
        assert result.mean == 0.0
        assert "No sources to evaluate" in result.calibration_notes

    def test_high_scores_flag(self, golden_evaluated_sources):
        """Scores with mean > 8 should flag leniency bias."""
        for s in golden_evaluated_sources:
            s.signals.learning_efficiency_score = 9
        result = compute_score_distribution(golden_evaluated_sources)
        assert any("leniency" in note for note in result.calibration_notes)

    def test_identical_scores_flag(self, golden_evaluated_sources):
        """All identical scores should flag evaluation issue."""
        for s in golden_evaluated_sources:
            s.signals.learning_efficiency_score = 5
        result = compute_score_distribution(golden_evaluated_sources)
        assert any("identical" in note for note in result.calibration_notes)


class TestExtractionSuccess:
    """Tests for compute_extraction_success."""

    def test_mixed_extraction(self, golden_evaluated_sources):
        result = compute_extraction_success(golden_evaluated_sources)
        assert result.total == 5
        assert result.success_count == 3  # sources 0, 1, 3 have deep_read_content
        assert result.rate == 0.6
        assert result.by_method.get("tavily", 0) == 2
        assert result.by_method.get("trafilatura", 0) == 1

    def test_empty_sources(self):
        result = compute_extraction_success([])
        assert result.total == 0
        assert result.rate == 0.0


class TestRelevanceCorrelation:
    """Tests for compute_relevance_correlation."""

    def test_with_citations(self, golden_evaluated_sources, golden_summary):
        result = compute_relevance_correlation(golden_evaluated_sources, golden_summary)
        assert result.correlation is not None
        assert len(result.scores) == 5
        assert len(result.cite_counts) == 5
        assert result.note != ""

    def test_no_citations(self, golden_evaluated_sources):
        result = compute_relevance_correlation(golden_evaluated_sources, "No citations here.")
        # All cite_counts should be 0
        assert all(c == 0 for c in result.cite_counts)

    def test_single_source(self, golden_evaluated_sources):
        result = compute_relevance_correlation(
            golden_evaluated_sources[:1], "Some [T](cite:1) text"
        )
        assert result.correlation is None
        assert "Not enough" in result.note


# ---------------------------------------------------------------------------
# LLM-as-judge metrics
# ---------------------------------------------------------------------------

class TestPrecisionAtK:
    """Tests for compute_precision_at_k."""

    async def test_all_relevant(self, golden_evaluated_sources, mock_judge_client):
        """All sources judged relevant gives precision=1.0."""
        result = await compute_precision_at_k(
            golden_evaluated_sources, "Python async", 3, mock_judge_client,
        )
        assert result.k == 3
        assert result.total == 3
        assert result.precision == 1.0
        assert result.relevant_count == 3
        assert mock_judge_client.messages.create.call_count == 3

    async def test_mixed_relevance(self, golden_evaluated_sources, mock_judge_client):
        """Mixed relevance judgments give correct precision."""
        responses = [
            make_judge_response({"relevant": True, "reason": "yes"}),
            make_judge_response({"relevant": False, "reason": "no"}),
            make_judge_response({"relevant": True, "reason": "yes"}),
        ]
        mock_judge_client.messages.create = AsyncMock(side_effect=responses)

        result = await compute_precision_at_k(
            golden_evaluated_sources, "Python async", 3, mock_judge_client,
        )
        assert result.relevant_count == 2
        assert abs(result.precision - 2 / 3) < 0.001

    async def test_k_larger_than_sources(self, golden_evaluated_sources, mock_judge_client):
        """K larger than source count uses all sources."""
        result = await compute_precision_at_k(
            golden_evaluated_sources, "Python async", 10, mock_judge_client,
        )
        assert result.total == 5


class TestContentTypeAccuracy:
    """Tests for compute_content_type_accuracy."""

    async def test_all_matching(self, golden_evaluated_sources, mock_judge_client):
        """When LLM classifies same type as pipeline, accuracy=1.0."""
        responses = [
            make_judge_response({"content_type": s.signals.content_type, "confidence": "high"})
            for s in golden_evaluated_sources
        ]
        mock_judge_client.messages.create = AsyncMock(side_effect=responses)

        result = await compute_content_type_accuracy(
            golden_evaluated_sources, mock_judge_client,
        )
        assert result.accuracy == 1.0
        assert result.matches == 5

    async def test_none_matching(self, golden_evaluated_sources, mock_judge_client):
        """When LLM classifies differently, accuracy=0.0."""
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"content_type": "other", "confidence": "low"})
        )
        # The first source is "tutorial", LLM says "other" — none of them are "other" originally
        # Actually source 0 is tutorial, 1 is paper, 2 is docs, 3 is opinion, 4 is forum
        # "other" matches none of them
        result = await compute_content_type_accuracy(
            golden_evaluated_sources, mock_judge_client,
        )
        assert result.accuracy == 0.0


class TestKeyInsightQuality:
    """Tests for compute_key_insight_quality."""

    async def test_scores_returned(self, golden_evaluated_sources, mock_judge_client):
        """Returns mean score and individual scores."""
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"score": 7, "reason": "good insight"})
        )

        result = await compute_key_insight_quality(
            golden_evaluated_sources, mock_judge_client,
        )
        assert result.mean_score == 7.0
        assert len(result.individual_scores) == 5
        assert mock_judge_client.messages.create.call_count == 5


class TestCoverageCompleteness:
    """Tests for compute_coverage_completeness."""

    async def test_partial_coverage(self, golden_evaluated_sources, mock_judge_client):
        """Sources cover some but not all expected subtopics."""
        # First call: coverage prompt returns expected subtopics
        coverage_response = make_judge_response({
            "subtopics": ["asyncio", "error handling", "testing", "deployment"],
        })
        mock_judge_client.messages.create = AsyncMock(return_value=coverage_response)

        result = await compute_coverage_completeness(
            golden_evaluated_sources, "Python async", mock_judge_client,
        )
        # "asyncio" and "error handling" should match coverage items
        assert result.coverage_ratio > 0
        assert len(result.expected_subtopics) == 4
        assert len(result.covered_subtopics) + len(result.missing_subtopics) == 4
