"""Tests for synthesis quality metrics."""
import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from beacon.evaluation.synthesis_metrics import (
    check_citation_indices,
    check_structural_compliance,
    check_timeline_validity,
    compute_assumption_quality,
    compute_citation_accuracy,
    compute_conflict_quality,
    compute_content_completeness,
    compute_flashcard_quality,
    compute_groundedness,
)
from tests.test_evaluation.conftest import make_judge_response


# ---------------------------------------------------------------------------
# Automated metrics
# ---------------------------------------------------------------------------

class TestCheckCitationIndices:
    """Tests for check_citation_indices."""

    def test_valid_and_invalid(self, golden_summary):
        total, valid, invalid = check_citation_indices(golden_summary, 5)
        # The golden summary has citations 1, 3, 2, 4, 5, 99, 1
        assert total == 7
        assert valid == 6  # cite:1 (x2), 2, 3, 4, 5
        assert 99 in invalid

    def test_all_valid(self):
        text = "Some [A](cite:1) and [B](cite:2) text."
        total, valid, invalid = check_citation_indices(text, 2)
        assert total == 2
        assert valid == 2
        assert invalid == []

    def test_no_citations(self):
        total, valid, invalid = check_citation_indices("No citations here.", 5)
        assert total == 0
        assert valid == 0
        assert invalid == []


class TestStructuralCompliance:
    """Tests for check_structural_compliance."""

    def test_valid_timeline(self, golden_timeline):
        result = check_structural_compliance("timeline", golden_timeline)
        assert result.artifact_type == "timeline"
        assert result.valid == 3
        assert result.invalid == 0
        assert result.errors == []

    def test_invalid_timeline_item(self):
        items = [{"date": "2024", "title": "T"}]  # Missing required fields
        result = check_structural_compliance("timeline", items)
        assert result.invalid == 1
        assert len(result.errors) == 1

    def test_valid_conflicts(self, golden_conflicts):
        result = check_structural_compliance("conflicts", golden_conflicts)
        assert result.valid == 1
        assert result.invalid == 0

    def test_valid_assumptions(self, golden_assumptions):
        result = check_structural_compliance("assumptions", golden_assumptions)
        assert result.valid == 1
        assert result.invalid == 0

    def test_unknown_type(self):
        result = check_structural_compliance("unknown", [{}])
        assert result.invalid == 1
        assert "Unknown artifact type" in result.errors[0]


class TestTimelineValidity:
    """Tests for check_timeline_validity."""

    def test_valid_timeline(self, golden_timeline):
        result = check_timeline_validity(golden_timeline)
        assert result.total_events == 3
        assert result.has_dates == 3
        assert result.chronological is True
        assert result.significance_distribution["high"] == 2
        assert result.significance_distribution["medium"] == 1

    def test_non_chronological(self):
        events = [
            {"date": "2024-01", "title": "Later", "significance": "high"},
            {"date": "2020-01", "title": "Earlier", "significance": "low"},
        ]
        result = check_timeline_validity(events)
        assert result.chronological is False
        assert any("Non-chronological" in issue for issue in result.issues)

    def test_missing_dates(self):
        events = [{"title": "No date", "significance": "low"}]
        result = check_timeline_validity(events)
        assert result.has_dates == 0
        assert any("missing date" in issue for issue in result.issues)

    def test_empty_timeline(self):
        result = check_timeline_validity([])
        assert result.total_events == 0
        assert result.chronological is True

    def test_invalid_significance(self):
        events = [{"date": "2024", "title": "T", "significance": "critical"}]
        result = check_timeline_validity(events)
        assert any("Invalid significance" in issue for issue in result.issues)


# ---------------------------------------------------------------------------
# LLM-as-judge metrics
# ---------------------------------------------------------------------------

class TestComputeCitationAccuracy:
    """Tests for compute_citation_accuracy."""

    async def test_detects_invalid_indices(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"supported": True, "reason": "matches"})
        )
        result = await compute_citation_accuracy(
            golden_summary, golden_evaluated_sources, mock_judge_client,
        )
        assert result.total_citations == 7
        assert result.valid_indices == 6
        assert 99 in result.invalid_indices

    async def test_checks_support(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        """Verifies LLM is called to check citation support."""
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"supported": True, "reason": "confirmed"})
        )
        result = await compute_citation_accuracy(
            golden_summary, golden_evaluated_sources, mock_judge_client,
        )
        # Should have support_scores for valid citations (up to 10)
        assert len(result.support_scores) > 0
        assert all(s["supported"] is True for s in result.support_scores)


class TestComputeGroundedness:
    """Tests for compute_groundedness."""

    async def test_grounded_claims(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({
                "claims": [
                    {"claim": "asyncio provides tools", "grounded": True, "reason": "found in source"},
                    {"claim": "event loop drives operations", "grounded": True, "reason": "confirmed"},
                ],
            })
        )
        result = await compute_groundedness(
            golden_summary, golden_evaluated_sources, mock_judge_client,
        )
        assert result.total_claims > 0
        assert result.groundedness_ratio == 1.0

    async def test_ungrounded_claims(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({
                "claims": [
                    {"claim": "made up fact", "grounded": False, "reason": "not in sources"},
                ],
            })
        )
        result = await compute_groundedness(
            golden_summary, golden_evaluated_sources, mock_judge_client,
        )
        assert result.groundedness_ratio == 0.0


class TestComputeContentCompleteness:
    """Tests for compute_content_completeness."""

    async def test_full_coverage(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({
                "key_topics": ["asyncio", "coroutines"],
                "covered": ["asyncio", "coroutines"],
                "missing": [],
            })
        )
        result = await compute_content_completeness(
            golden_summary, golden_evaluated_sources, "Python async",
            mock_judge_client,
        )
        assert result.completeness_ratio == 1.0
        assert result.missing == []

    async def test_partial_coverage(
        self, golden_summary, golden_evaluated_sources, mock_judge_client,
    ):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({
                "key_topics": ["asyncio", "testing", "deployment"],
                "covered": ["asyncio"],
                "missing": ["testing", "deployment"],
            })
        )
        result = await compute_content_completeness(
            golden_summary, golden_evaluated_sources, "Python async",
            mock_judge_client,
        )
        assert abs(result.completeness_ratio - 1 / 3) < 0.01


class TestComputeFlashcardQuality:
    """Tests for compute_flashcard_quality."""

    async def test_scores_all_cards(self, golden_flashcards, mock_judge_client):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"score": 8, "reason": "clear and accurate"})
        )
        result = await compute_flashcard_quality(golden_flashcards, mock_judge_client)
        assert result.mean_score == 8.0
        assert len(result.individual_scores) == 3
        assert mock_judge_client.messages.create.call_count == 3

    async def test_empty_flashcards(self, mock_judge_client):
        result = await compute_flashcard_quality([], mock_judge_client)
        assert result.mean_score == 0.0
        assert result.individual_scores == []


class TestComputeConflictQuality:
    """Tests for compute_conflict_quality."""

    async def test_genuine_conflict(self, golden_conflicts, mock_judge_client):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"genuine": True, "reason": "real disagreement"})
        )
        result = await compute_conflict_quality(golden_conflicts, mock_judge_client)
        assert result.total == 1
        assert result.genuine == 1
        assert result.false_positive == 0

    async def test_false_positive(self, golden_conflicts, mock_judge_client):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"genuine": False, "reason": "different contexts"})
        )
        result = await compute_conflict_quality(golden_conflicts, mock_judge_client)
        assert result.genuine == 0
        assert result.false_positive == 1

    async def test_empty_conflicts(self, mock_judge_client):
        result = await compute_conflict_quality([], mock_judge_client)
        assert result.total == 0


class TestComputeAssumptionQuality:
    """Tests for compute_assumption_quality."""

    async def test_valid_assumption(self, golden_assumptions, mock_judge_client):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"valid": True, "reason": "genuinely hidden"})
        )
        result = await compute_assumption_quality(golden_assumptions, mock_judge_client)
        assert result.total == 1
        assert result.valid == 1
        assert result.invalid == 0

    async def test_invalid_assumption(self, golden_assumptions, mock_judge_client):
        mock_judge_client.messages.create = AsyncMock(
            return_value=make_judge_response({"valid": False, "reason": "too obvious"})
        )
        result = await compute_assumption_quality(golden_assumptions, mock_judge_client)
        assert result.valid == 0
        assert result.invalid == 1

    async def test_empty_assumptions(self, mock_judge_client):
        result = await compute_assumption_quality([], mock_judge_client)
        assert result.total == 0
