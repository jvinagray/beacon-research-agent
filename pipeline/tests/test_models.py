"""Tests for beacon.models -- write these FIRST."""
import json
import pytest
from beacon.models import (
    Source,
    IntelligenceSignals,
    EvaluatedSource,
    Flashcard,
    ResearchResult,
    StatusEvent,
    SourcesFoundEvent,
    SourceEvaluatedEvent,
    ArtifactEvent,
    ErrorEvent,
    CompleteEvent,
)


class TestSource:
    def test_source_accepts_valid_data(self):
        src = Source(url="https://example.com", title="Example", snippet="A snippet.")
        assert src.url == "https://example.com"
        assert src.title == "Example"
        assert src.snippet == "A snippet."


class TestIntelligenceSignals:
    def test_valid_signals(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=8,
            content_type="tutorial",
            time_estimate_minutes=15,
            recency="2025",
            key_insight="Great tutorial.",
            coverage=["basics", "advanced"],
        )
        assert signals.learning_efficiency_score == 8
        assert signals.evaluation_failed is False

    def test_score_minimum_boundary(self):
        """Score of 0 is allowed (used for failed evaluations)."""
        signals = IntelligenceSignals(
            learning_efficiency_score=0,
            content_type="other",
            time_estimate_minutes=0,
            recency=None,
            key_insight="Evaluation failed",
            coverage=[],
            evaluation_failed=True,
        )
        assert signals.learning_efficiency_score == 0

    def test_score_maximum_boundary(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=10,
            content_type="tutorial",
            time_estimate_minutes=5,
            recency=None,
            key_insight="Perfect.",
            coverage=["all"],
        )
        assert signals.learning_efficiency_score == 10

    def test_all_valid_content_types(self):
        valid_types = [
            "tutorial", "paper", "docs", "opinion", "video",
            "forum", "repository", "course", "other",
        ]
        for ct in valid_types:
            signals = IntelligenceSignals(
                learning_efficiency_score=5,
                content_type=ct,
                time_estimate_minutes=10,
                recency=None,
                key_insight="Test.",
                coverage=[],
            )
            assert signals.content_type == ct

    def test_evaluation_failed_defaults_to_false(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=5,
            content_type="docs",
            time_estimate_minutes=10,
            recency=None,
            key_insight="Test.",
            coverage=[],
        )
        assert signals.evaluation_failed is False


class TestEvaluatedSource:
    def test_optional_fields_default_to_none(self):
        signals = IntelligenceSignals(
            learning_efficiency_score=7,
            content_type="tutorial",
            time_estimate_minutes=10,
            recency=None,
            key_insight="Good.",
            coverage=["topic"],
        )
        src = EvaluatedSource(
            url="https://example.com",
            title="Example",
            snippet="Snippet.",
            signals=signals,
            deep_read_content=None,
            extraction_method=None,
        )
        assert src.deep_read_content is None
        assert src.extraction_method is None


class TestFlashcard:
    def test_flashcard_requires_both_fields(self):
        fc = Flashcard(question="What is X?", answer="X is Y.")
        assert fc.question == "What is X?"
        assert fc.answer == "X is Y."

    def test_flashcard_rejects_missing_question(self):
        with pytest.raises(Exception):
            Flashcard(answer="Answer only.")

    def test_flashcard_rejects_missing_answer(self):
        with pytest.raises(Exception):
            Flashcard(question="Question only.")


class TestResearchResult:
    def test_research_result_accepts_valid_data(self):
        result = ResearchResult(
            topic="AI agents",
            depth="standard",
            sources=[],
            artifacts={"summary": "text", "concept_map": "text", "flashcards": [], "resources": []},
            session_id="abc-123",
            timestamp="2025-01-01T00:00:00Z",
        )
        assert result.topic == "AI agents"
        assert result.depth == "standard"
        assert isinstance(result.session_id, str)
        assert isinstance(result.timestamp, str)

    def test_artifacts_field_accepts_dict(self):
        result = ResearchResult(
            topic="test",
            depth="quick",
            sources=[],
            artifacts={"summary": "s", "concept_map": "c", "flashcards": [], "resources": []},
            session_id="id",
            timestamp="ts",
        )
        assert "summary" in result.artifacts


class TestPipelineEvents:
    def test_status_event_type_discriminator(self):
        evt = StatusEvent(message="Searching...")
        data = evt.model_dump()
        assert data["type"] == "status"

    def test_sources_found_event_type(self):
        evt = SourcesFoundEvent(count=3, sources=[])
        data = evt.model_dump()
        assert data["type"] == "sources_found"

    def test_source_evaluated_event_type(self):
        from beacon.models import IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=7, content_type="docs",
            time_estimate_minutes=10, recency=None,
            key_insight="Good.", coverage=["x"],
        )
        src = EvaluatedSource(
            url="https://example.com", title="T", snippet="S",
            signals=signals, deep_read_content=None, extraction_method=None,
        )
        evt = SourceEvaluatedEvent(index=0, total=5, source=src)
        data = evt.model_dump()
        assert data["type"] == "source_evaluated"

    def test_artifact_event_type(self):
        evt = ArtifactEvent(artifact_type="summary", data="Summary text.")
        data = evt.model_dump()
        assert data["type"] == "artifact"

    def test_artifact_event_supports_resources_type(self):
        evt = ArtifactEvent(artifact_type="resources", data="[]")
        assert evt.artifact_type == "resources"

    def test_artifact_event_supports_timeline_type(self):
        evt = ArtifactEvent(artifact_type="timeline", data="[]")
        assert evt.artifact_type == "timeline"

    def test_artifact_event_supports_conflicts_type(self):
        evt = ArtifactEvent(artifact_type="conflicts", data="[]")
        assert evt.artifact_type == "conflicts"

    def test_artifact_event_supports_assumptions_type(self):
        evt = ArtifactEvent(artifact_type="assumptions", data="[]")
        assert evt.artifact_type == "assumptions"

    def test_error_event_type(self):
        evt = ErrorEvent(message="Something failed.", recoverable=True)
        data = evt.model_dump()
        assert data["type"] == "error"

    def test_complete_event_type(self):
        result = ResearchResult(
            topic="t", depth="quick", sources=[], artifacts={},
            session_id="id", timestamp="ts",
        )
        evt = CompleteEvent(session_id="id", result=result)
        data = evt.model_dump()
        assert data["type"] == "complete"

    def test_all_events_serialize_to_json(self):
        """Every event type must be JSON-serializable."""
        events = [
            StatusEvent(message="test"),
            SourcesFoundEvent(count=0, sources=[]),
            ArtifactEvent(artifact_type="summary", data="text"),
            ErrorEvent(message="err", recoverable=False),
        ]
        for evt in events:
            json_str = evt.model_dump_json()
            parsed = json.loads(json_str)
            assert "type" in parsed
