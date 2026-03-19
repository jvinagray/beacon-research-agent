"""Tests for beacon.synthesize -- write these FIRST."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from beacon.models import EvaluatedSource, IntelligenceSignals, Flashcard


def _make_source(url: str, score: int, has_content: bool = True) -> EvaluatedSource:
    """Helper: create an EvaluatedSource for testing."""
    signals = IntelligenceSignals(
        learning_efficiency_score=score,
        content_type="tutorial",
        time_estimate_minutes=10,
        recency="2025",
        key_insight=f"Insight for {url}.",
        coverage=["topic"],
    )
    return EvaluatedSource(
        url=url,
        title=f"Source at {url}",
        snippet="Original snippet.",
        signals=signals,
        deep_read_content="# Full Content\n\nDetailed article content here. " * 20 if has_content else None,
        extraction_method="tavily_extract" if has_content else None,
    )


@pytest.fixture
def sources():
    """Mix of deep-read and snippet-only sources."""
    return [
        _make_source("https://example.com/a", 9, has_content=True),
        _make_source("https://example.com/b", 7, has_content=True),
        _make_source("https://example.com/c", 5, has_content=False),
    ]


def _mock_claude_text_response(text: str) -> MagicMock:
    """Create a mock Claude response with the given text."""
    response = MagicMock()
    response.content = [MagicMock()]
    response.content[0].text = text
    return response


class TestSynthesizeMakesSixParallelCalls:
    @pytest.mark.asyncio
    async def test_six_parallel_claude_calls(self, sources):
        """synthesize() must make exactly 6 Claude API calls (summary, concept_map, flashcards, timeline, conflicts, assumptions)."""
        client = AsyncMock()
        flashcards_json = json.dumps([
            {"question": "What is X?", "answer": "X is Y."},
            {"question": "What is Z?", "answer": "Z is W."},
        ])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("# Executive Summary\n\nSummary content."),
            _mock_claude_text_response("# Concept Map\n\n- Topic A\n  - Subtopic B"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "test topic", "standard", client=client)
        assert client.messages.create.call_count == 6


class TestModelSelection:
    @pytest.mark.asyncio
    async def test_all_calls_use_opus_model(self, sources):
        """All synthesis calls must use claude-opus-4-6."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        for c in client.messages.create.call_args_list:
            assert c[1]["model"] == "claude-opus-4-6"


class TestMaxTokens:
    @pytest.mark.asyncio
    async def test_summary_max_tokens_4096(self, sources):
        """Summary call must set max_tokens=4096."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        summary_call = client.messages.create.call_args_list[0]
        assert summary_call[1]["max_tokens"] == 4096

    @pytest.mark.asyncio
    async def test_concept_map_max_tokens_2048(self, sources):
        """Concept map call must set max_tokens=2048."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        concept_call = client.messages.create.call_args_list[1]
        assert concept_call[1]["max_tokens"] == 2048

    @pytest.mark.asyncio
    async def test_flashcards_max_tokens_2048(self, sources):
        """Flashcards call must set max_tokens=2048."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        fc_call = client.messages.create.call_args_list[2]
        assert fc_call[1]["max_tokens"] == 2048

    @pytest.mark.asyncio
    async def test_timeline_max_tokens_2048(self, sources):
        """Timeline call must set max_tokens=2048."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "test topic", "standard", client=client)
        timeline_call = client.messages.create.call_args_list[3]
        assert timeline_call[1]["max_tokens"] == 2048


class TestArtifactOutputs:
    @pytest.mark.asyncio
    async def test_summary_returns_markdown_string(self, sources):
        """Summary artifact must be a markdown string."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("# Executive Summary\n\nKey findings..."),
            _mock_claude_text_response("# Concept Map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["summary"], str)
        assert "Executive Summary" in result["summary"]

    @pytest.mark.asyncio
    async def test_concept_map_returns_markdown_string(self, sources):
        """Concept map artifact must be a markdown string."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("# Concept Map\n\n- Topic\n  - Subtopic"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["concept_map"], str)

    @pytest.mark.asyncio
    async def test_flashcards_returns_list_of_flashcard_objects(self, sources):
        """Flashcards artifact must be a list of Flashcard objects."""
        client = AsyncMock()
        flashcards_json = json.dumps([
            {"question": "What is X?", "answer": "X is Y."},
            {"question": "What is Z?", "answer": "Z is W."},
        ])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert isinstance(result["flashcards"], list)
        assert all(isinstance(fc, Flashcard) for fc in result["flashcards"])
        assert len(result["flashcards"]) == 2


class TestResourcesArtifact:
    @pytest.mark.asyncio
    async def test_resources_assembled_without_extra_claude_call(self, sources):
        """Resources artifact is built from source data, no extra Claude call needed."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert "resources" in result
        assert client.messages.create.call_count == 6

    @pytest.mark.asyncio
    async def test_resources_contains_all_sources_with_signals(self, sources):
        """Resources artifact must include all sources with their IntelligenceSignals."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        resources = result["resources"]
        assert isinstance(resources, list)
        assert len(resources) == len(sources)


class TestSynthesisContextBlock:
    @pytest.mark.asyncio
    async def test_context_includes_deep_read_and_snippet_sources(self, sources):
        """The shared context block must include deep-read content and snippet-only sources."""
        from beacon.prompts import build_synthesis_context
        context = build_synthesis_context("test topic", "standard", sources)
        assert "Full Content" in context
        assert "snippet" in context.lower()
        for s in sources:
            assert s.url in context


class TestPartialFailure:
    @pytest.mark.asyncio
    async def test_one_artifact_failure_does_not_block_others(self, sources):
        """If one synthesis call fails, the other artifacts should still be returned."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            Exception("Summary generation failed"),
            _mock_claude_text_response("# Concept Map\n\nContent."),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert result.get("concept_map") is not None
        assert result.get("flashcards") is not None
        assert result.get("summary") is None


class TestFlashcardFenceStripping:
    """Tests for markdown code fence stripping in _generate_flashcards."""

    @pytest.mark.asyncio
    async def test_strips_json_fenced_response(self, sources):
        """_generate_flashcards strips ```json fenced response and parses flashcards."""
        client = AsyncMock()
        flashcards = [{"question": "What is X?", "answer": "X is Y."}]
        fenced = f'```json\n{json.dumps(flashcards)}\n```'
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(fenced),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert len(result["flashcards"]) == 1
        assert result["flashcards"][0].question == "What is X?"

    @pytest.mark.asyncio
    async def test_strips_plain_fenced_response(self, sources):
        """_generate_flashcards strips plain ``` fenced response (no language tag)."""
        client = AsyncMock()
        flashcards = [{"question": "What is A?", "answer": "A is B."}]
        fenced = f'```\n{json.dumps(flashcards)}\n```'
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(fenced),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert len(result["flashcards"]) == 1
        assert result["flashcards"][0].question == "What is A?"

    @pytest.mark.asyncio
    async def test_handles_whitespace_around_fences(self, sources):
        """_generate_flashcards handles response with leading/trailing whitespace around fences."""
        client = AsyncMock()
        flashcards = [{"question": "Q1?", "answer": "A1."}]
        fenced = f'  ```json \n{json.dumps(flashcards)}\n ```  '
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(fenced),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert len(result["flashcards"]) == 1

    @pytest.mark.asyncio
    async def test_clean_json_still_works(self, sources):
        """_generate_flashcards still works with clean unfenced JSON."""
        client = AsyncMock()
        flashcards = [{"question": "Q?", "answer": "A."}, {"question": "Q2?", "answer": "A2."}]
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(json.dumps(flashcards)),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert len(result["flashcards"]) == 2

    @pytest.mark.asyncio
    async def test_invalid_json_returns_empty_list(self, sources):
        """_generate_flashcards returns [] for completely invalid JSON."""
        client = AsyncMock()
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response("This is not JSON at all, just garbage text."),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert result["flashcards"] == []


class TestTimelineGeneration:
    """Tests for _generate_timeline and timeline in synthesize()."""

    @pytest.mark.asyncio
    async def test_generate_timeline_returns_list_of_event_dicts(self, sources):
        """_generate_timeline returns list of timeline event dicts."""
        client = AsyncMock()
        timeline_events = [
            {"date": "2024-01", "title": "Launch", "description": "Product launched.",
             "source_title": "Source A", "significance": "high"},
            {"date": "2024-06", "title": "Update", "description": "Major update.",
             "source_title": "Source B", "significance": "medium"},
        ]
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(json.dumps(timeline_events))
        )
        from beacon.synthesize import _generate_timeline
        result = await _generate_timeline("test context", client)
        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["title"] == "Launch"
        assert result[1]["significance"] == "medium"

    @pytest.mark.asyncio
    async def test_generate_timeline_strips_code_fences(self, sources):
        """_generate_timeline strips markdown code fences before JSON parsing."""
        client = AsyncMock()
        timeline_events = [{"date": "2024-01", "title": "Event", "description": "Desc.",
                           "source_title": "Src", "significance": "low"}]
        fenced = f'```json\n{json.dumps(timeline_events)}\n```'
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(fenced)
        )
        from beacon.synthesize import _generate_timeline
        result = await _generate_timeline("test context", client)
        assert isinstance(result, list)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_generate_timeline_returns_empty_on_malformed_json(self, sources):
        """_generate_timeline returns empty list on malformed JSON."""
        client = AsyncMock()
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response("This is prose, not JSON.")
        )
        from beacon.synthesize import _generate_timeline
        result = await _generate_timeline("test context", client)
        assert result == []

    @pytest.mark.asyncio
    async def test_generate_timeline_returns_empty_on_non_json(self, sources):
        """_generate_timeline returns empty list on non-JSON response."""
        client = AsyncMock()
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response("No temporal events found")
        )
        from beacon.synthesize import _generate_timeline
        result = await _generate_timeline("test context", client)
        assert result == []

    @pytest.mark.asyncio
    async def test_synthesize_includes_timeline_in_artifacts(self, sources):
        """synthesize() includes timeline in returned artifacts dict."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        timeline_json = json.dumps([{"date": "2024-01", "title": "E", "description": "D",
                                     "source_title": "S", "significance": "high"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(timeline_json),
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert "timeline" in result
        assert isinstance(result["timeline"], list)
        assert len(result["timeline"]) == 1

    @pytest.mark.asyncio
    async def test_synthesize_runs_all_generators_in_parallel(self, sources):
        """synthesize() runs all 6 generators in parallel — 6 calls total."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # empty timeline
            _mock_claude_text_response(json.dumps([])),  # empty conflicts
            _mock_claude_text_response(json.dumps([])),  # empty assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "topic", "standard", client=client)
        assert client.messages.create.call_count == 6


class TestGenerateConflicts:
    """Tests for _generate_conflicts."""

    @pytest.mark.asyncio
    async def test_generate_conflicts_returns_list_of_conflict_dicts(self, sources):
        """_generate_conflicts returns list of conflict dicts."""
        client = AsyncMock()
        conflicts = [
            {
                "topic": "Effectiveness of X",
                "source_a": {"title": "Paper A", "claim": "X improves by 40%"},
                "source_b": {"title": "Report B", "claim": "No significant improvement"},
                "assessment": "Different methodologies explain the discrepancy",
            }
        ]
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(json.dumps(conflicts))
        )
        from beacon.synthesize import _generate_conflicts
        result = await _generate_conflicts("test context", client)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["topic"] == "Effectiveness of X"
        assert result[0]["source_a"]["title"] == "Paper A"

    @pytest.mark.asyncio
    async def test_generate_conflicts_strips_code_fences(self, sources):
        """_generate_conflicts strips markdown code fences before JSON parsing."""
        client = AsyncMock()
        conflicts = [{"topic": "T", "source_a": {"title": "A", "claim": "C1"},
                       "source_b": {"title": "B", "claim": "C2"}, "assessment": "A"}]
        fenced = f'```json\n{json.dumps(conflicts)}\n```'
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(fenced)
        )
        from beacon.synthesize import _generate_conflicts
        result = await _generate_conflicts("test context", client)
        assert isinstance(result, list)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_generate_conflicts_returns_empty_on_malformed_response(self, sources):
        """_generate_conflicts returns empty list on malformed response."""
        client = AsyncMock()
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response("No conflicts found in sources.")
        )
        from beacon.synthesize import _generate_conflicts
        result = await _generate_conflicts("test context", client)
        assert result == []


class TestGenerateAssumptions:
    """Tests for _generate_assumptions."""

    @pytest.mark.asyncio
    async def test_generate_assumptions_returns_list_of_assumption_dicts(self, sources):
        """_generate_assumptions returns list of assumption dicts."""
        client = AsyncMock()
        assumptions = [
            {
                "assumption": "Hardware trends continue at same pace",
                "why_it_matters": "Feasibility depends on continued scaling",
                "sources_relying": ["Tech Roadmap", "Industry Analysis"],
                "risk_level": "medium",
            }
        ]
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(json.dumps(assumptions))
        )
        from beacon.synthesize import _generate_assumptions
        result = await _generate_assumptions("test context", client)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["assumption"] == "Hardware trends continue at same pace"
        assert result[0]["risk_level"] == "medium"

    @pytest.mark.asyncio
    async def test_generate_assumptions_strips_code_fences(self, sources):
        """_generate_assumptions strips markdown code fences before JSON parsing."""
        client = AsyncMock()
        assumptions = [{"assumption": "A", "why_it_matters": "M",
                         "sources_relying": ["S"], "risk_level": "low"}]
        fenced = f'```json\n{json.dumps(assumptions)}\n```'
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response(fenced)
        )
        from beacon.synthesize import _generate_assumptions
        result = await _generate_assumptions("test context", client)
        assert isinstance(result, list)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_generate_assumptions_returns_empty_on_malformed_response(self, sources):
        """_generate_assumptions returns empty list on malformed response."""
        client = AsyncMock()
        client.messages.create = AsyncMock(
            return_value=_mock_claude_text_response("No notable assumptions detected.")
        )
        from beacon.synthesize import _generate_assumptions
        result = await _generate_assumptions("test context", client)
        assert result == []


class TestExtractJsonArray:
    """Tests for _extract_json_array — robust JSON extraction from Claude prose."""

    def test_bare_json_array(self):
        from beacon.synthesize import _extract_json_array
        result = _extract_json_array('[{"q": "Q", "a": "A"}]')
        assert result == [{"q": "Q", "a": "A"}]

    def test_code_fenced_json(self):
        from beacon.synthesize import _extract_json_array
        text = '```json\n[{"q": "Q"}]\n```'
        assert _extract_json_array(text) == [{"q": "Q"}]

    def test_json_embedded_in_prose(self):
        from beacon.synthesize import _extract_json_array
        text = 'Here are the flashcards:\n\n[{"q": "Q", "a": "A"}]'
        assert _extract_json_array(text) == [{"q": "Q", "a": "A"}]

    def test_prose_with_stray_brackets_before_json(self):
        """Key bug: prose containing [brackets] before the actual JSON array."""
        from beacon.synthesize import _extract_json_array
        text = 'Based on [5 sources], here are the results:\n\n[{"q": "Q", "a": "A"}]'
        result = _extract_json_array(text)
        assert result is not None
        assert len(result) == 1
        assert result[0]["q"] == "Q"

    def test_fenced_json_with_surrounding_prose(self):
        from beacon.synthesize import _extract_json_array
        text = 'Here are the items:\n\n```json\n[{"x": 1}]\n```\n\nEnjoy!'
        result = _extract_json_array(text)
        assert result == [{"x": 1}]

    def test_returns_none_for_no_json(self):
        from beacon.synthesize import _extract_json_array
        assert _extract_json_array("No data available.") is None

    def test_returns_none_for_non_list_json(self):
        from beacon.synthesize import _extract_json_array
        assert _extract_json_array('{"key": "value"}') is None

    def test_empty_array(self):
        from beacon.synthesize import _extract_json_array
        assert _extract_json_array('[]') == []


class TestPromptOverrides:
    """Tests for prompt_overrides parameter in synthesize()."""

    @pytest.mark.asyncio
    async def test_custom_summary_prompt_is_used(self, sources):
        """When prompt_overrides includes 'summary', the custom prompt is sent to Claude."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Custom summary output"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),
            _mock_claude_text_response(json.dumps([])),
            _mock_claude_text_response(json.dumps([])),
        ])
        custom_prompt = "CUSTOM SUMMARY TEMPLATE: {context}"
        from beacon.synthesize import synthesize
        result = await synthesize(
            sources, "topic", "standard", client=client,
            prompt_overrides={"summary": custom_prompt},
        )
        # The first call (summary) should use our custom prompt
        summary_call = client.messages.create.call_args_list[0]
        sent_prompt = summary_call[1]["messages"][0]["content"]
        assert "CUSTOM SUMMARY TEMPLATE:" in sent_prompt
        assert result["summary"] == "Custom summary output"

    @pytest.mark.asyncio
    async def test_non_overridden_prompts_use_defaults(self, sources):
        """Artifacts not in prompt_overrides still use their default prompts."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),
            _mock_claude_text_response(json.dumps([])),
            _mock_claude_text_response(json.dumps([])),
        ])
        from beacon.synthesize import synthesize
        from beacon.prompts import GENERATE_CONCEPT_MAP_PROMPT
        await synthesize(
            sources, "topic", "standard", client=client,
            prompt_overrides={"summary": "CUSTOM: {context}"},
        )
        # The concept_map call (index 1) should use the default prompt
        concept_call = client.messages.create.call_args_list[1]
        sent_prompt = concept_call[1]["messages"][0]["content"]
        # Default concept map prompt starts with "You are a knowledge organizer"
        assert "knowledge organizer" in sent_prompt


class TestSynthesizeIncludesConflictsAndAssumptions:
    """Tests for conflicts and assumptions in synthesize() output."""

    @pytest.mark.asyncio
    async def test_synthesize_includes_conflicts_in_artifacts(self, sources):
        """synthesize() includes conflicts in returned artifacts dict."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        conflicts_json = json.dumps([{"topic": "T", "source_a": {"title": "A", "claim": "C1"},
                                       "source_b": {"title": "B", "claim": "C2"}, "assessment": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # timeline
            _mock_claude_text_response(conflicts_json),
            _mock_claude_text_response(json.dumps([])),  # assumptions
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert "conflicts" in result
        assert isinstance(result["conflicts"], list)
        assert len(result["conflicts"]) == 1

    @pytest.mark.asyncio
    async def test_synthesize_includes_assumptions_in_artifacts(self, sources):
        """synthesize() includes assumptions in returned artifacts dict."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        assumptions_json = json.dumps([{"assumption": "A", "why_it_matters": "M",
                                         "sources_relying": ["S"], "risk_level": "high"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # timeline
            _mock_claude_text_response(json.dumps([])),  # conflicts
            _mock_claude_text_response(assumptions_json),
        ])
        from beacon.synthesize import synthesize
        result = await synthesize(sources, "topic", "standard", client=client)
        assert "assumptions" in result
        assert isinstance(result["assumptions"], list)
        assert len(result["assumptions"]) == 1

    @pytest.mark.asyncio
    async def test_synthesize_runs_six_generators_in_parallel(self, sources):
        """synthesize() runs all 6 generators in parallel (call_count == 6)."""
        client = AsyncMock()
        flashcards_json = json.dumps([{"question": "Q", "answer": "A"}])
        client.messages.create = AsyncMock(side_effect=[
            _mock_claude_text_response("Summary"),
            _mock_claude_text_response("Concept map"),
            _mock_claude_text_response(flashcards_json),
            _mock_claude_text_response(json.dumps([])),  # timeline
            _mock_claude_text_response(json.dumps([])),  # conflicts
            _mock_claude_text_response(json.dumps([])),  # assumptions
        ])
        from beacon.synthesize import synthesize
        await synthesize(sources, "topic", "standard", client=client)
        assert client.messages.create.call_count == 6
