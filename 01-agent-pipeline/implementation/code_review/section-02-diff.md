diff --git a/01-agent-pipeline/beacon/models.py b/01-agent-pipeline/beacon/models.py
new file mode 100644
index 0000000..523d64f
--- /dev/null
+++ b/01-agent-pipeline/beacon/models.py
@@ -0,0 +1,84 @@
+"""Beacon data models: all Pydantic models and pipeline event types."""
+from pydantic import BaseModel
+from typing import Literal, Any
+
+
+class Source(BaseModel):
+    url: str
+    title: str
+    snippet: str
+
+
+class IntelligenceSignals(BaseModel):
+    learning_efficiency_score: int
+    content_type: Literal[
+        "tutorial", "paper", "docs", "opinion", "video",
+        "forum", "repository", "course", "other"
+    ]
+    time_estimate_minutes: int
+    recency: str | None
+    key_insight: str
+    coverage: list[str]
+    evaluation_failed: bool = False
+
+
+class EvaluatedSource(BaseModel):
+    url: str
+    title: str
+    snippet: str
+    signals: IntelligenceSignals
+    deep_read_content: str | None = None
+    extraction_method: str | None = None
+
+
+class Flashcard(BaseModel):
+    question: str
+    answer: str
+
+
+class ResearchResult(BaseModel):
+    topic: str
+    depth: str
+    sources: list[EvaluatedSource]
+    artifacts: dict[str, Any]
+    session_id: str
+    timestamp: str
+
+
+class StatusEvent(BaseModel):
+    type: Literal["status"] = "status"
+    message: str
+
+
+class SourcesFoundEvent(BaseModel):
+    type: Literal["sources_found"] = "sources_found"
+    count: int
+    sources: list[Source]
+
+
+class SourceEvaluatedEvent(BaseModel):
+    type: Literal["source_evaluated"] = "source_evaluated"
+    index: int
+    total: int
+    source: EvaluatedSource
+
+
+class ArtifactEvent(BaseModel):
+    type: Literal["artifact"] = "artifact"
+    artifact_type: Literal["summary", "concept_map", "flashcards", "resources"]
+    data: str | list[Flashcard]
+
+
+class ErrorEvent(BaseModel):
+    type: Literal["error"] = "error"
+    message: str
+    recoverable: bool
+
+
+class CompleteEvent(BaseModel):
+    type: Literal["complete"] = "complete"
+    session_id: str
+    result: ResearchResult
+
+
+PipelineEvent = StatusEvent | SourcesFoundEvent | SourceEvaluatedEvent | ArtifactEvent | ErrorEvent | CompleteEvent
diff --git a/01-agent-pipeline/beacon/prompts.py b/01-agent-pipeline/beacon/prompts.py
new file mode 100644
index 0000000..1f0c0bb
--- /dev/null
+++ b/01-agent-pipeline/beacon/prompts.py
@@ -0,0 +1,142 @@
+"""Beacon prompt templates: all Claude prompts and helper functions."""
+from __future__ import annotations
+
+from typing import TYPE_CHECKING
+
+if TYPE_CHECKING:
+    from beacon.models import EvaluatedSource
+
+EVALUATE_SOURCE_PROMPT = """\
+You are a research source evaluator. Your task is to evaluate how useful a web source is for someone learning about a specific topic.
+
+Analyze the source and respond with a single JSON object (no markdown, no explanation) with these fields:
+- learning_efficiency_score (integer 1-10): How efficiently someone can learn from this source
+- content_type (string): One of "tutorial", "paper", "docs", "opinion", "video", "forum", "repository", "course", "other"
+- time_estimate_minutes (integer): Estimated reading/viewing time
+- recency (string or null): Year or date if detectable, null otherwise
+- key_insight (string): 1-2 sentence summary of the source's main value
+- coverage (array of strings): Subtopics this source covers
+
+Scoring rubric:
+- 9-10: Comprehensive, directly on-topic, well-structured for learning
+- 7-8: Good coverage of the topic with useful examples or explanations
+- 5-6: Partially relevant, covers some aspects but missing depth
+- 3-4: Tangentially related, limited learning value for this topic
+- 1-2: Off-topic or very low quality content
+
+Example output:
+{{"learning_efficiency_score": 8, "content_type": "tutorial", "time_estimate_minutes": 15, "recency": "2025", "key_insight": "Comprehensive walkthrough of core concepts with hands-on examples.", "coverage": ["fundamentals", "best practices", "implementation"]}}
+
+Topic: {topic}
+URL: {url}
+Title: {title}
+Snippet: {snippet}
+
+Respond with ONLY the JSON object."""
+
+GENERATE_SUMMARY_PROMPT = """\
+You are a research synthesizer. Based on the sources provided below, write an executive summary that:
+
+1. Synthesizes insights ACROSS all sources (do not summarize each source individually)
+2. Highlights areas of consensus and any disagreements between sources
+3. Uses clear markdown headings to organize the summary
+4. Is 1-2 pages of well-structured markdown
+
+Focus on the most important findings and practical takeaways. Write for someone who wants to quickly understand the current state of knowledge on this topic.
+
+{context}
+
+Write the executive summary now."""
+
+GENERATE_CONCEPT_MAP_PROMPT = """\
+You are a knowledge organizer. Based on the sources provided below, create a concept map in indented markdown outline format.
+
+Requirements:
+- Organize by concept hierarchy, NOT by source
+- Use indentation to show parent-child relationships between concepts
+- Show prerequisites and relationships between concepts
+- Include brief descriptions for each concept node
+
+Format example:
+- **Core Concept A**
+  - Sub-concept A1: Brief description
+    - Detail: Explanation
+  - Sub-concept A2: Brief description
+    - Relates to: Concept B
+- **Core Concept B**
+  - Sub-concept B1: Brief description
+
+{context}
+
+Create the concept map now."""
+
+GENERATE_FLASHCARDS_PROMPT = """\
+You are a study aid creator. Based on the sources provided below, generate 10-20 flashcards as testable question/answer pairs.
+
+Requirements:
+- Focus on factual, verifiable content
+- Questions should be specific and unambiguous
+- Answers should be concise but complete
+- Cover the most important concepts from the sources
+
+Output a JSON array of objects, each with "question" and "answer" fields.
+
+Example:
+[
+  {"question": "What is the primary purpose of X?", "answer": "X is used to accomplish Y by doing Z."},
+  {"question": "What are the three main types of A?", "answer": "The three types are B, C, and D."}
+]
+
+{context}
+
+Respond with ONLY the JSON array."""
+
+
+def build_evaluate_prompt(topic: str, url: str, title: str, snippet: str) -> str:
+    """Build a fully formatted evaluation prompt for a single source.
+
+    Inserts the source metadata into ``EVALUATE_SOURCE_PROMPT``.
+    """
+    return EVALUATE_SOURCE_PROMPT.format(
+        topic=topic,
+        url=url,
+        title=title,
+        snippet=snippet,
+    )
+
+
+def build_synthesis_context(
+    topic: str,
+    depth: str,
+    sources: list[EvaluatedSource],
+) -> str:
+    """Build the shared context block used by all synthesis prompts.
+
+    For each source, includes title, URL, score, key insight, and either
+    the full deep-read content or the snippet (marked as "snippet only").
+    """
+    lines = [
+        f"# Research Context",
+        f"**Topic:** {topic}",
+        f"**Depth:** {depth}",
+        f"**Sources:** {len(sources)}",
+        "",
+    ]
+
+    for i, src in enumerate(sources, 1):
+        lines.append(f"## Source {i}: {src.title}")
+        lines.append(f"**URL:** {src.url}")
+        lines.append(f"**Score:** {src.signals.learning_efficiency_score}/10")
+        lines.append(f"**Key Insight:** {src.signals.key_insight}")
+        lines.append("")
+
+        if src.deep_read_content is not None:
+            lines.append("### Content")
+            lines.append(src.deep_read_content)
+        else:
+            lines.append("### Snippet Only")
+            lines.append(src.snippet)
+
+        lines.append("")
+
+    return "\n".join(lines)
diff --git a/01-agent-pipeline/tests/test_models.py b/01-agent-pipeline/tests/test_models.py
new file mode 100644
index 0000000..c1db098
--- /dev/null
+++ b/01-agent-pipeline/tests/test_models.py
@@ -0,0 +1,216 @@
+"""Tests for beacon.models -- write these FIRST."""
+import json
+import pytest
+from beacon.models import (
+    Source,
+    IntelligenceSignals,
+    EvaluatedSource,
+    Flashcard,
+    ResearchResult,
+    StatusEvent,
+    SourcesFoundEvent,
+    SourceEvaluatedEvent,
+    ArtifactEvent,
+    ErrorEvent,
+    CompleteEvent,
+)
+
+
+class TestSource:
+    def test_source_accepts_valid_data(self):
+        src = Source(url="https://example.com", title="Example", snippet="A snippet.")
+        assert src.url == "https://example.com"
+        assert src.title == "Example"
+        assert src.snippet == "A snippet."
+
+
+class TestIntelligenceSignals:
+    def test_valid_signals(self):
+        signals = IntelligenceSignals(
+            learning_efficiency_score=8,
+            content_type="tutorial",
+            time_estimate_minutes=15,
+            recency="2025",
+            key_insight="Great tutorial.",
+            coverage=["basics", "advanced"],
+        )
+        assert signals.learning_efficiency_score == 8
+        assert signals.evaluation_failed is False
+
+    def test_score_minimum_boundary(self):
+        """Score of 0 is allowed (used for failed evaluations)."""
+        signals = IntelligenceSignals(
+            learning_efficiency_score=0,
+            content_type="other",
+            time_estimate_minutes=0,
+            recency=None,
+            key_insight="Evaluation failed",
+            coverage=[],
+            evaluation_failed=True,
+        )
+        assert signals.learning_efficiency_score == 0
+
+    def test_score_maximum_boundary(self):
+        signals = IntelligenceSignals(
+            learning_efficiency_score=10,
+            content_type="tutorial",
+            time_estimate_minutes=5,
+            recency=None,
+            key_insight="Perfect.",
+            coverage=["all"],
+        )
+        assert signals.learning_efficiency_score == 10
+
+    def test_all_valid_content_types(self):
+        valid_types = [
+            "tutorial", "paper", "docs", "opinion", "video",
+            "forum", "repository", "course", "other",
+        ]
+        for ct in valid_types:
+            signals = IntelligenceSignals(
+                learning_efficiency_score=5,
+                content_type=ct,
+                time_estimate_minutes=10,
+                recency=None,
+                key_insight="Test.",
+                coverage=[],
+            )
+            assert signals.content_type == ct
+
+    def test_evaluation_failed_defaults_to_false(self):
+        signals = IntelligenceSignals(
+            learning_efficiency_score=5,
+            content_type="docs",
+            time_estimate_minutes=10,
+            recency=None,
+            key_insight="Test.",
+            coverage=[],
+        )
+        assert signals.evaluation_failed is False
+
+
+class TestEvaluatedSource:
+    def test_optional_fields_default_to_none(self):
+        signals = IntelligenceSignals(
+            learning_efficiency_score=7,
+            content_type="tutorial",
+            time_estimate_minutes=10,
+            recency=None,
+            key_insight="Good.",
+            coverage=["topic"],
+        )
+        src = EvaluatedSource(
+            url="https://example.com",
+            title="Example",
+            snippet="Snippet.",
+            signals=signals,
+            deep_read_content=None,
+            extraction_method=None,
+        )
+        assert src.deep_read_content is None
+        assert src.extraction_method is None
+
+
+class TestFlashcard:
+    def test_flashcard_requires_both_fields(self):
+        fc = Flashcard(question="What is X?", answer="X is Y.")
+        assert fc.question == "What is X?"
+        assert fc.answer == "X is Y."
+
+    def test_flashcard_rejects_missing_question(self):
+        with pytest.raises(Exception):
+            Flashcard(answer="Answer only.")
+
+    def test_flashcard_rejects_missing_answer(self):
+        with pytest.raises(Exception):
+            Flashcard(question="Question only.")
+
+
+class TestResearchResult:
+    def test_research_result_accepts_valid_data(self):
+        result = ResearchResult(
+            topic="AI agents",
+            depth="standard",
+            sources=[],
+            artifacts={"summary": "text", "concept_map": "text", "flashcards": [], "resources": []},
+            session_id="abc-123",
+            timestamp="2025-01-01T00:00:00Z",
+        )
+        assert result.topic == "AI agents"
+        assert result.depth == "standard"
+        assert isinstance(result.session_id, str)
+        assert isinstance(result.timestamp, str)
+
+    def test_artifacts_field_accepts_dict(self):
+        result = ResearchResult(
+            topic="test",
+            depth="quick",
+            sources=[],
+            artifacts={"summary": "s", "concept_map": "c", "flashcards": [], "resources": []},
+            session_id="id",
+            timestamp="ts",
+        )
+        assert "summary" in result.artifacts
+
+
+class TestPipelineEvents:
+    def test_status_event_type_discriminator(self):
+        evt = StatusEvent(message="Searching...")
+        data = evt.model_dump()
+        assert data["type"] == "status"
+
+    def test_sources_found_event_type(self):
+        evt = SourcesFoundEvent(count=3, sources=[])
+        data = evt.model_dump()
+        assert data["type"] == "sources_found"
+
+    def test_source_evaluated_event_type(self):
+        from beacon.models import IntelligenceSignals
+        signals = IntelligenceSignals(
+            learning_efficiency_score=7, content_type="docs",
+            time_estimate_minutes=10, recency=None,
+            key_insight="Good.", coverage=["x"],
+        )
+        src = EvaluatedSource(
+            url="https://example.com", title="T", snippet="S",
+            signals=signals, deep_read_content=None, extraction_method=None,
+        )
+        evt = SourceEvaluatedEvent(index=0, total=5, source=src)
+        data = evt.model_dump()
+        assert data["type"] == "source_evaluated"
+
+    def test_artifact_event_type(self):
+        evt = ArtifactEvent(artifact_type="summary", data="Summary text.")
+        data = evt.model_dump()
+        assert data["type"] == "artifact"
+
+    def test_artifact_event_supports_resources_type(self):
+        evt = ArtifactEvent(artifact_type="resources", data="[]")
+        assert evt.artifact_type == "resources"
+
+    def test_error_event_type(self):
+        evt = ErrorEvent(message="Something failed.", recoverable=True)
+        data = evt.model_dump()
+        assert data["type"] == "error"
+
+    def test_complete_event_type(self):
+        result = ResearchResult(
+            topic="t", depth="quick", sources=[], artifacts={},
+            session_id="id", timestamp="ts",
+        )
+        evt = CompleteEvent(session_id="id", result=result)
+        data = evt.model_dump()
+        assert data["type"] == "complete"
+
+    def test_all_events_serialize_to_json(self):
+        """Every event type must be JSON-serializable."""
+        events = [
+            StatusEvent(message="test"),
+            SourcesFoundEvent(count=0, sources=[]),
+            ArtifactEvent(artifact_type="summary", data="text"),
+            ErrorEvent(message="err", recoverable=False),
+        ]
+        for evt in events:
+            json_str = evt.model_dump_json()
+            parsed = json.loads(json_str)
+            assert "type" in parsed
diff --git a/01-agent-pipeline/tests/test_prompts.py b/01-agent-pipeline/tests/test_prompts.py
new file mode 100644
index 0000000..81f0032
--- /dev/null
+++ b/01-agent-pipeline/tests/test_prompts.py
@@ -0,0 +1,60 @@
+"""Tests for beacon.prompts -- write these FIRST."""
+from beacon.prompts import (
+    EVALUATE_SOURCE_PROMPT,
+    GENERATE_SUMMARY_PROMPT,
+    GENERATE_CONCEPT_MAP_PROMPT,
+    GENERATE_FLASHCARDS_PROMPT,
+    build_evaluate_prompt,
+    build_synthesis_context,
+)
+
+
+class TestPromptConstants:
+    def test_evaluate_prompt_is_nonempty(self):
+        assert len(EVALUATE_SOURCE_PROMPT) > 0
+
+    def test_evaluate_prompt_contains_scoring_rubric(self):
+        assert "9-10" in EVALUATE_SOURCE_PROMPT or "scoring" in EVALUATE_SOURCE_PROMPT.lower()
+
+    def test_evaluate_prompt_contains_fewshot_example(self):
+        assert "example" in EVALUATE_SOURCE_PROMPT.lower() or "learning_efficiency_score" in EVALUATE_SOURCE_PROMPT
+
+    def test_summary_prompt_is_nonempty(self):
+        assert len(GENERATE_SUMMARY_PROMPT) > 0
+
+    def test_concept_map_prompt_is_nonempty(self):
+        assert len(GENERATE_CONCEPT_MAP_PROMPT) > 0
+
+    def test_flashcards_prompt_is_nonempty(self):
+        assert len(GENERATE_FLASHCARDS_PROMPT) > 0
+
+
+class TestPromptFunctions:
+    def test_build_evaluate_prompt_includes_source_data(self):
+        prompt = build_evaluate_prompt(
+            topic="machine learning",
+            url="https://example.com/ml",
+            title="ML Tutorial",
+            snippet="A great ML tutorial.",
+        )
+        assert "machine learning" in prompt
+        assert "https://example.com/ml" in prompt
+        assert "ML Tutorial" in prompt
+        assert "A great ML tutorial." in prompt
+
+    def test_build_synthesis_context_includes_deep_read(self):
+        from beacon.models import EvaluatedSource, IntelligenceSignals
+        signals = IntelligenceSignals(
+            learning_efficiency_score=8, content_type="tutorial",
+            time_estimate_minutes=10, recency=None,
+            key_insight="Great.", coverage=["topic"],
+        )
+        sources = [EvaluatedSource(
+            url="https://example.com", title="Test", snippet="Snippet.",
+            signals=signals, deep_read_content="# Full Content\n\nDetails here.",
+            extraction_method="tavily_extract",
+        )]
+        context = build_synthesis_context("test topic", "standard", sources)
+        assert "test topic" in context
+        assert "# Full Content" in context
+        assert "https://example.com" in context
