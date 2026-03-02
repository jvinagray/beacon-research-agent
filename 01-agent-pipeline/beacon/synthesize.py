"""Beacon synthesize module: artifact generation."""
import asyncio
import json
import logging
from typing import Any

from anthropic import AsyncAnthropic

from beacon.config import SYNTH_MODEL, SYNTH_TIMEOUT
from beacon.models import EvaluatedSource, Flashcard
from beacon.prompts import (
    GENERATE_CONCEPT_MAP_PROMPT,
    GENERATE_FLASHCARDS_PROMPT,
    GENERATE_SUMMARY_PROMPT,
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
    text = response.content[0].text
    try:
        items = json.loads(text)
        return [Flashcard(**item) for item in items]
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Failed to parse flashcards JSON, returning empty list")
        return []


async def synthesize(
    sources: list[EvaluatedSource],
    topic: str,
    depth: str,
    client: AsyncAnthropic | None = None,
) -> dict[str, Any]:
    """Generate learning artifacts from evaluated sources.

    Makes 3 parallel Claude Opus calls for summary, concept_map, and flashcards.
    Assembles a 4th artifact (resources) directly from the source data.
    """
    # Build shared context once
    context = build_synthesis_context(topic, depth, sources)

    # Launch three calls in parallel
    results = await asyncio.gather(
        _generate_summary(context, client),
        _generate_concept_map(context, client),
        _generate_flashcards(context, client),
        return_exceptions=True,
    )

    # Process results, handling exceptions
    summary = results[0] if not isinstance(results[0], Exception) else None
    concept_map = results[1] if not isinstance(results[1], Exception) else None
    flashcards = results[2] if not isinstance(results[2], Exception) else []

    if isinstance(results[0], Exception):
        logger.warning("Summary generation failed: %s", results[0])
    if isinstance(results[1], Exception):
        logger.warning("Concept map generation failed: %s", results[1])
    if isinstance(results[2], Exception):
        logger.warning("Flashcards generation failed: %s", results[2])

    # Resources artifact: assembled directly from source data
    resources = [source.model_dump() for source in sources]

    return {
        "summary": summary,
        "concept_map": concept_map,
        "flashcards": flashcards,
        "resources": resources,
    }
