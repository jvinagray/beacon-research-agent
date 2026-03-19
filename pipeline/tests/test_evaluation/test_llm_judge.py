"""Tests for the LLM judge infrastructure."""
import json

import pytest
from unittest.mock import AsyncMock, MagicMock

from beacon.evaluation.llm_judge import judge, judge_batch, _extract_json_object


class TestJudge:
    """Tests for the judge() single-call function."""

    async def test_parses_clean_json(self, mock_judge_client):
        """Judge correctly parses a clean JSON response."""
        result = await judge("test prompt", mock_judge_client)
        assert result["relevant"] is True
        assert "reason" in result

    async def test_strips_markdown_fences(self, mock_judge_client):
        """Judge strips ```json fences before parsing."""
        response = MagicMock()
        response.content = [MagicMock()]
        response.content[0].text = '```json\n{"score": 8, "reason": "good"}\n```'
        mock_judge_client.messages.create = AsyncMock(return_value=response)

        result = await judge("test prompt", mock_judge_client)
        assert result["score"] == 8

    async def test_extracts_json_from_prose(self, mock_judge_client):
        """Judge extracts JSON object embedded in prose text."""
        response = MagicMock()
        response.content = [MagicMock()]
        response.content[0].text = 'Here is my evaluation: {"valid": true, "reason": "test"} That is all.'
        mock_judge_client.messages.create = AsyncMock(return_value=response)

        result = await judge("test prompt", mock_judge_client)
        assert result["valid"] is True

    async def test_retries_on_first_failure(self, mock_judge_client):
        """Judge retries once if the first call fails."""
        good_response = MagicMock()
        good_response.content = [MagicMock()]
        good_response.content[0].text = '{"ok": true}'

        mock_judge_client.messages.create = AsyncMock(
            side_effect=[Exception("API error"), good_response]
        )

        result = await judge("test prompt", mock_judge_client)
        assert result["ok"] is True
        assert mock_judge_client.messages.create.call_count == 2

    async def test_raises_after_all_retries(self, mock_judge_client):
        """Judge raises after all 3 attempts fail."""
        mock_judge_client.messages.create = AsyncMock(
            side_effect=Exception("persistent error")
        )

        with pytest.raises(Exception, match="persistent error"):
            await judge("test prompt", mock_judge_client)

        assert mock_judge_client.messages.create.call_count == 3

    async def test_uses_eval_model(self, mock_judge_client):
        """Judge uses EVAL_MODEL for the API call."""
        from beacon.config import EVAL_MODEL

        await judge("test prompt", mock_judge_client)
        call_kwargs = mock_judge_client.messages.create.call_args.kwargs
        assert call_kwargs["model"] == EVAL_MODEL

    async def test_recovers_truncated_json(self, mock_judge_client):
        """Judge recovers from truncated JSON (max_tokens cutoff)."""
        response = MagicMock()
        response.content = [MagicMock()]
        response.content[0].text = '{"claims": [{"claim": "test", "grounded": true, "reason": "ok"}, {"claim": "cut off'
        mock_judge_client.messages.create = AsyncMock(return_value=response)

        result = await judge("test prompt", mock_judge_client)
        assert "claims" in result


class TestExtractJsonObject:
    """Tests for the _extract_json_object helper."""

    def test_clean_json(self):
        result = _extract_json_object('{"a": 1}')
        assert result == {"a": 1}

    def test_fenced_json(self):
        result = _extract_json_object('```json\n{"a": 1}\n```')
        assert result == {"a": 1}

    def test_prose_wrapped(self):
        result = _extract_json_object('Here: {"a": 1} done.')
        assert result == {"a": 1}

    def test_truncated_array(self):
        text = '{"items": [1, 2, 3'
        result = _extract_json_object(text)
        assert result["items"] == [1, 2, 3]

    def test_truncated_nested(self):
        text = '{"claims": [{"c": "x", "g": true}'
        result = _extract_json_object(text)
        assert "claims" in result

    def test_raises_on_no_json(self):
        with pytest.raises(json.JSONDecodeError):
            _extract_json_object("no json here")


class TestJudgeBatch:
    """Tests for the judge_batch() parallel function."""

    async def test_processes_multiple_prompts(self, mock_judge_client):
        """judge_batch processes all prompts and returns results in order."""
        results = await judge_batch(
            ["prompt1", "prompt2", "prompt3"],
            mock_judge_client,
        )
        assert len(results) == 3
        assert all(r["relevant"] is True for r in results)

    async def test_respects_semaphore_limit(self, mock_judge_client):
        """judge_batch calls all prompts (semaphore limits concurrency, not count)."""
        results = await judge_batch(
            [f"prompt{i}" for i in range(10)],
            mock_judge_client,
            semaphore_limit=2,
        )
        assert len(results) == 10
        assert mock_judge_client.messages.create.call_count == 10

    async def test_empty_prompts(self, mock_judge_client):
        """judge_batch returns empty list for empty input."""
        results = await judge_batch([], mock_judge_client)
        assert results == []

    async def test_returns_list_of_dicts(self, mock_judge_client):
        """judge_batch returns a list (not a tuple) of dicts."""
        results = await judge_batch(["p1", "p2"], mock_judge_client)
        assert isinstance(results, list)
        assert all(isinstance(r, dict) for r in results)
