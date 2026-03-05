"""Beacon synthesize module: artifact generation."""
import asyncio
import json
import logging
import re
from typing import Any

from anthropic import AsyncAnthropic

from beacon.config import SYNTH_MODEL, SYNTH_TIMEOUT
from beacon.models import EvaluatedSource, Flashcard
from beacon.prompts import (
    GENERATE_CONCEPT_MAP_PROMPT,
    GENERATE_FLASHCARDS_PROMPT,
    GENERATE_SUMMARY_PROMPT,
    GENERATE_TIMELINE_PROMPT,
    build_synthesis_context,
)

logger = logging.getLogger(__name__)


async def _generate_summary(context: str, client: AsyncAnthropic) -> str:
    """Generate executive summary. max_tokens=4096, timeout=SYNTH_TIMEOUT."""
    prompt = GENERATE_SUMMARY_PROMPT.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    return response.content[0].text


async def _generate_concept_map(context: str, client: AsyncAnthropic) -> str:
    """Generate concept map/outline. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = GENERATE_CONCEPT_MAP_PROMPT.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    return response.content[0].text


async def _generate_flashcards(context: str, client: AsyncAnthropic) -> list[Flashcard]:
    """Generate flashcards. max_tokens=2048, timeout=SYNTH_TIMEOUT.

    Parses JSON array from Claude response, validates each as Flashcard.
    """
    prompt = GENERATE_FLASHCARDS_PROMPT.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text.strip()
    # Strip markdown code fences if present (flexible: any language tag, \r\n)
    text = re.sub(
        r'^\s*```[a-zA-Z]*\s*\r?\n?(.*?)\r?\n?\s*```\s*$',
        r'\1',
        text,
        flags=re.DOTALL,
    )
    # Fallback: if text still doesn't start with '[', try to extract the JSON array
    text = text.strip()
    if not text.startswith('['):
        match = re.search(r'\[.*\]', text, flags=re.DOTALL)
        if match:
            text = match.group(0)
    try:
        items = json.loads(text)
        if not isinstance(items, list):
            logger.warning("Flashcards response is not a list, returning empty")
            return []
        return [Flashcard(**item) for item in items]
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Failed to parse flashcards JSON: %s — raw text: %.200s", exc, text)
        return []


async def _generate_timeline(context: str, client: AsyncAnthropic) -> list[dict]:
    """Generate timeline events. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = GENERATE_TIMELINE_PROMPT.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    text = re.sub(
        r'^\s*```[a-zA-Z]*\s*\r?\n?(.*?)\r?\n?\s*```\s*$',
        r'\1',
        text,
        flags=re.DOTALL,
    )
    text = text.strip()
    if not text.startswith('['):
        match = re.search(r'\[.*\]', text, flags=re.DOTALL)
        if match:
            text = match.group(0)
    try:
        items = json.loads(text)
        if not isinstance(items, list):
            logger.warning("Timeline response is not a list, returning empty")
            return []
        return items
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Failed to parse timeline JSON: %s — raw text: %.200s", exc, text)
        return []


async def synthesize(
    sources: list[EvaluatedSource],
    topic: str,
    depth: str,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Generate learning artifacts from evaluated sources.

    Makes 4 parallel Claude Opus calls for summary, concept_map, flashcards, and timeline.
    Assembles a 5th artifact (resources) directly from the source data.
    """
    # Build shared context once
    context = build_synthesis_context(topic, depth, sources)

    # Launch four calls in parallel
    results = await asyncio.gather(
        _generate_summary(context, client),
        _generate_concept_map(context, client),
        _generate_flashcards(context, client),
        _generate_timeline(context, client),
        return_exceptions=True,
    )

    # Process results, handling exceptions
    summary = results[0] if not isinstance(results[0], Exception) else None
    concept_map = results[1] if not isinstance(results[1], Exception) else None
    flashcards = results[2] if not isinstance(results[2], Exception) else []
    timeline = results[3] if not isinstance(results[3], Exception) else []

    if isinstance(results[0], Exception):
        logger.warning("Summary generation failed: %s", results[0])
    if isinstance(results[1], Exception):
        logger.warning("Concept map generation failed: %s", results[1])
    if isinstance(results[2], Exception):
        logger.warning("Flashcards generation failed: %s", results[2])
    if isinstance(results[3], Exception):
        logger.warning("Timeline generation failed: %s", results[3])

    # Resources artifact: assembled directly from source data
    resources = [source.model_dump() for source in sources]

    return {
        "summary": summary,
        "concept_map": concept_map,
        "flashcards": flashcards,
        "timeline": timeline,
        "resources": resources,
    }
