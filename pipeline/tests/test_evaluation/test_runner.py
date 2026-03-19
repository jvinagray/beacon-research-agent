"""Tests for the evaluation runner/orchestrator."""
import json

import pytest
from unittest.mock import AsyncMock

from beacon.evaluation.models import FullEvalReport, RAGEvalReport, SynthesisEvalReport
from beacon.evaluation.runner import run_full_eval, run_rag_eval, run_synthesis_eval
from tests.test_evaluation.conftest import make_judge_response


def _make_multi_response_client():
    """Create a mock client that returns different responses based on prompt content."""
    client = AsyncMock()

    def _route_response(*args, **kwargs):
        messages = kwargs.get("messages", [])
        prompt = messages[0]["content"] if messages else ""

        # Return appropriate response shapes based on prompt keywords
        if "relevant" in prompt.lower() or "evaluating whether" in prompt.lower():
            return make_judge_response({"relevant": True, "reason": "on topic"})
        if "content type" in prompt.lower() or "classifying" in prompt.lower():
            return make_judge_response({"content_type": "tutorial", "confidence": "high"})
        if "key insight" in prompt.lower() or "score this key" in prompt.lower():
            return make_judge_response({"score": 8, "reason": "good"})
        if "subtopics" in prompt.lower() or "expected subtopics" in prompt.lower():
            return make_judge_response({"subtopics": ["asyncio", "coroutines"]})
        if "citation" in prompt.lower() or "support" in prompt.lower():
            return make_judge_response({"supported": True, "reason": "confirmed"})
        if "groundedness" in prompt.lower() or "factual claim" in prompt.lower():
            return make_judge_response({
                "claims": [{"claim": "test", "grounded": True, "reason": "found"}],
            })
        if "completeness" in prompt.lower() or "key topics" in prompt.lower():
            return make_judge_response({
                "key_topics": ["asyncio"], "covered": ["asyncio"], "missing": [],
            })
        if "flashcard" in prompt.lower():
            return make_judge_response({"score": 7, "reason": "decent"})
        if "conflict" in prompt.lower() or "genuine" in prompt.lower():
            return make_judge_response({"genuine": True, "reason": "real"})
        if "assumption" in prompt.lower() or "hidden" in prompt.lower():
            return make_judge_response({"valid": True, "reason": "hidden"})

        # Default
        return make_judge_response({"ok": True})

    client.messages.create = AsyncMock(side_effect=_route_response)
    return client


class TestRunRAGEval:
    """Tests for run_rag_eval."""

    async def test_returns_rag_report(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_rag_eval(golden_research_result, client, k=3)

        assert isinstance(report, RAGEvalReport)
        assert report.precision_at_k is not None
        assert report.precision_at_k.k == 3
        assert report.score_distribution is not None
        assert report.extraction_success is not None
        assert report.relevance_correlation is not None
        assert report.content_type_accuracy is not None
        assert report.key_insight_quality is not None
        assert report.coverage_completeness is not None

    async def test_automated_metrics_correct(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_rag_eval(golden_research_result, client)

        # Verify automated metrics computed correctly
        assert report.score_distribution.mean == 6.8
        assert report.extraction_success.total == 5
        assert report.extraction_success.success_count == 3


class TestRunSynthesisEval:
    """Tests for run_synthesis_eval."""

    async def test_returns_synthesis_report(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_synthesis_eval(golden_research_result, client)

        assert isinstance(report, SynthesisEvalReport)
        assert report.citation_accuracy is not None
        assert report.groundedness is not None
        assert report.content_completeness is not None
        assert report.flashcard_quality is not None
        assert report.timeline_validity is not None
        assert report.conflict_quality is not None
        assert report.assumption_quality is not None

    async def test_structural_compliance_checked(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_synthesis_eval(golden_research_result, client)

        # Should have compliance results for timeline, conflicts, assumptions
        assert len(report.structural_compliance) == 3
        types = {r.artifact_type for r in report.structural_compliance}
        assert types == {"timeline", "conflicts", "assumptions"}

    async def test_timeline_validity(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_synthesis_eval(golden_research_result, client)

        assert report.timeline_validity.total_events == 3
        assert report.timeline_validity.chronological is True


class TestRunFullEval:
    """Tests for run_full_eval."""

    async def test_returns_full_report(self, golden_research_result):
        client = _make_multi_response_client()
        report = await run_full_eval(golden_research_result, client, k=3)

        assert isinstance(report, FullEvalReport)
        assert report.topic == "Python async patterns"
        assert isinstance(report.rag, RAGEvalReport)
        assert isinstance(report.synthesis, SynthesisEvalReport)
        assert report.timestamp != ""

    async def test_serializes_to_json(self, golden_research_result):
        """Full report must serialize to valid JSON."""
        client = _make_multi_response_client()
        report = await run_full_eval(golden_research_result, client, k=3)

        json_str = report.model_dump_json(indent=2)
        parsed = json.loads(json_str)
        assert parsed["topic"] == "Python async patterns"
        assert "rag" in parsed
        assert "synthesis" in parsed

    async def test_report_roundtrip(self, golden_research_result):
        """Report can be serialized and deserialized."""
        client = _make_multi_response_client()
        report = await run_full_eval(golden_research_result, client, k=3)

        json_str = report.model_dump_json()
        restored = FullEvalReport.model_validate_json(json_str)
        assert restored.topic == report.topic
        assert restored.rag.score_distribution.mean == report.rag.score_distribution.mean


@pytest.mark.live_eval
class TestLiveEval:
    """Integration tests that require API keys. Skipped in CI."""

    async def test_live_full_eval(self):
        """Run full evaluation against a real ResearchResult (requires API keys)."""
        pytest.skip("Live evaluation test — run with: pytest -m live_eval")
