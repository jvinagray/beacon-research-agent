"""Tests for beacon.prompts -- write these FIRST."""
from beacon.prompts import (
    EVALUATE_SOURCE_PROMPT,
    GENERATE_SUMMARY_PROMPT,
    GENERATE_CONCEPT_MAP_PROMPT,
    GENERATE_FLASHCARDS_PROMPT,
    build_evaluate_prompt,
    build_synthesis_context,
)


class TestPromptConstants:
    def test_evaluate_prompt_is_nonempty(self):
        assert len(EVALUATE_SOURCE_PROMPT) > 0

    def test_evaluate_prompt_contains_scoring_rubric(self):
        assert "9-10" in EVALUATE_SOURCE_PROMPT or "scoring" in EVALUATE_SOURCE_PROMPT.lower()

    def test_evaluate_prompt_contains_fewshot_example(self):
        assert "example" in EVALUATE_SOURCE_PROMPT.lower() or "learning_efficiency_score" in EVALUATE_SOURCE_PROMPT

    def test_summary_prompt_is_nonempty(self):
        assert len(GENERATE_SUMMARY_PROMPT) > 0

    def test_concept_map_prompt_is_nonempty(self):
        assert len(GENERATE_CONCEPT_MAP_PROMPT) > 0

    def test_flashcards_prompt_is_nonempty(self):
        assert len(GENERATE_FLASHCARDS_PROMPT) > 0

    def test_summary_prompt_includes_citation_instructions(self):
        """GENERATE_SUMMARY_PROMPT must instruct the LLM to use cite:N format."""
        assert "cite:" in GENERATE_SUMMARY_PROMPT


class TestPromptFunctions:
    def test_build_evaluate_prompt_includes_source_data(self):
        prompt = build_evaluate_prompt(
            topic="machine learning",
            url="https://example.com/ml",
            title="ML Tutorial",
            snippet="A great ML tutorial.",
        )
        assert "machine learning" in prompt
        assert "https://example.com/ml" in prompt
        assert "ML Tutorial" in prompt
        assert "A great ML tutorial." in prompt

    def test_build_synthesis_context_includes_deep_read(self):
        from beacon.models import EvaluatedSource, IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=8, content_type="tutorial",
            time_estimate_minutes=10, recency=None,
            key_insight="Great.", coverage=["topic"],
        )
        sources = [EvaluatedSource(
            url="https://example.com", title="Test", snippet="Snippet.",
            signals=signals, deep_read_content="# Full Content\n\nDetails here.",
            extraction_method="tavily_extract",
        )]
        context = build_synthesis_context("test topic", "standard", sources)
        assert "test topic" in context
        assert "# Full Content" in context
        assert "https://example.com" in context
