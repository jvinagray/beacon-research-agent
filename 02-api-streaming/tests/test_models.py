"""Tests for API-layer Pydantic models."""
import pytest
from pydantic import ValidationError
from server.models import ResearchRequest, CompleteSummary, ResearchSummary


class TestResearchRequest:
    """Tests for ResearchRequest model validation."""

    def test_accepts_valid_depth_quick(self):
        """ResearchRequest accepts depth='quick'."""
        req = ResearchRequest(topic="Python asyncio", depth="quick")
        assert req.depth == "quick"
        assert req.topic == "Python asyncio"

    def test_accepts_valid_depth_standard(self):
        """ResearchRequest accepts depth='standard'."""
        req = ResearchRequest(topic="Machine learning", depth="standard")
        assert req.depth == "standard"

    def test_accepts_valid_depth_deep(self):
        """ResearchRequest accepts depth='deep'."""
        req = ResearchRequest(topic="Quantum computing", depth="deep")
        assert req.depth == "deep"

    def test_rejects_invalid_depth(self):
        """ResearchRequest rejects invalid depth value like 'ultra'."""
        with pytest.raises(ValidationError):
            ResearchRequest(topic="Test topic", depth="ultra")

    def test_requires_topic_field(self):
        """ResearchRequest requires a topic field."""
        with pytest.raises(ValidationError):
            ResearchRequest(depth="quick")


class TestCompleteSummary:
    """Tests for CompleteSummary serialization."""

    def test_serializes_with_type_complete(self):
        """CompleteSummary serializes to JSON with type='complete'."""
        summary = ResearchSummary(
            topic="Python asyncio",
            depth="standard",
            source_count=15,
            artifact_types=["summary", "concept_map", "flashcards", "resources"],
        )
        complete = CompleteSummary(session_id="abc123", summary=summary)
        data = complete.model_dump()
        assert data["type"] == "complete"
        assert data["session_id"] == "abc123"

    def test_research_summary_includes_all_fields(self):
        """ResearchSummary includes topic, depth, source_count, artifact_types."""
        summary = ResearchSummary(
            topic="Machine learning",
            depth="deep",
            source_count=25,
            artifact_types=["summary", "flashcards"],
        )
        data = summary.model_dump()
        assert data["topic"] == "Machine learning"
        assert data["depth"] == "deep"
        assert data["source_count"] == 25
        assert data["artifact_types"] == ["summary", "flashcards"]

    def test_complete_summary_json_roundtrip(self):
        """CompleteSummary can serialize to JSON and deserialize back."""
        summary = ResearchSummary(
            topic="Test",
            depth="quick",
            source_count=3,
            artifact_types=["summary"],
        )
        complete = CompleteSummary(session_id="xyz789", summary=summary)
        json_str = complete.model_dump_json()
        restored = CompleteSummary.model_validate_json(json_str)
        assert restored.session_id == "xyz789"
        assert restored.summary.source_count == 3
