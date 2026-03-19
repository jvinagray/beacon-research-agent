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
    GENERATE_ASSUMPTIONS_PROMPT,
    GENERATE_CONCEPT_MAP_PROMPT,
    GENERATE_CONFLICTS_PROMPT,
    GENERATE_FLASHCARDS_PROMPT,
    GENERATE_SUMMARY_PROMPT,
    GENERATE_TIMELINE_PROMPT,
    build_synthesis_context,
)

logger = logging.getLogger(__name__)


def _extract_json_array(text: str) -> list | None:
    """Robustly extract a JSON array from Claude's response text.

    Handles: bare JSON, code-fenced JSON, JSON embedded in prose,
    and prose containing stray brackets before the actual array.
    Returns the parsed list, or None on failure.
    """
    text = text.strip()

    # 1. Strip markdown code fences (```json ... ```)
    stripped = re.sub(
        r'^\s*```[a-zA-Z]*\s*\r?\n?(.*?)\r?\n?\s*```\s*$',
        r'\1',
        text,
        flags=re.DOTALL,
    ).strip()

    # 2. Try direct parse (covers bare JSON and successful fence stripping)
    if stripped.startswith('['):
        try:
            result = json.loads(stripped)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    # 3. Look for a JSON array of objects embedded in prose: find [{ pattern
    match = re.search(r'\[\s*\{', text)
    if match:
        candidate = text[match.start():]
        # Try parsing progressively shorter substrings from the last ]
        for end in [m.end() for m in re.finditer(r'\]', candidate)][::-1]:
            try:
                result = json.loads(candidate[:end])
                if isinstance(result, list):
                    return result
            except json.JSONDecodeError:
                continue

    # 4. Last resort: try any [...] match
    match = re.search(r'\[.*\]', text, flags=re.DOTALL)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    return None


async def _generate_summary(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_SUMMARY_PROMPT,
) -> str:
    """Generate executive summary. max_tokens=4096, timeout=SYNTH_TIMEOUT."""
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    return response.content[0].text


async def _generate_concept_map(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_CONCEPT_MAP_PROMPT,
) -> str:
    """Generate concept map/outline. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    return response.content[0].text


async def _generate_flashcards(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_FLASHCARDS_PROMPT,
) -> list[Flashcard]:
    """Generate flashcards. max_tokens=2048, timeout=SYNTH_TIMEOUT.

    Parses JSON array from Claude response, validates each as Flashcard.
    """
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text
    items = _extract_json_array(text)
    if items is None:
        logger.warning("Failed to parse flashcards JSON — raw text: %.300s", text.strip())
        return []
    try:
        return [Flashcard(**item) for item in items]
    except (TypeError, ValueError) as exc:
        logger.warning("Invalid flashcard structure: %s — parsed: %.200s", exc, items)
        return []


async def _generate_timeline(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_TIMELINE_PROMPT,
) -> list[dict]:
    """Generate timeline events. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text
    items = _extract_json_array(text)
    if items is None:
        logger.warning("Failed to parse timeline JSON — raw text: %.300s", text.strip())
        return []
    return items


async def _generate_conflicts(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_CONFLICTS_PROMPT,
) -> list[dict]:
    """Generate conflict detection. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text
    items = _extract_json_array(text)
    if items is None:
        logger.warning("Failed to parse conflicts JSON — raw text: %.300s", text.strip())
        return []
    return items


async def _generate_assumptions(
    context: str, client: AsyncAnthropic, *, prompt_template: str = GENERATE_ASSUMPTIONS_PROMPT,
) -> list[dict]:
    """Generate assumption surfacing. max_tokens=2048, timeout=SYNTH_TIMEOUT."""
    prompt = prompt_template.replace("{context}", context)
    response = await asyncio.wait_for(
        client.messages.create(
            model=SYNTH_MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=SYNTH_TIMEOUT,
    )
    text = response.content[0].text
    items = _extract_json_array(text)
    if items is None:
        logger.warning("Failed to parse assumptions JSON — raw text: %.300s", text.strip())
        return []
    return items


async def synthesize(
    sources: list[EvaluatedSource],
    topic: str,
    depth: str,
    client: AsyncAnthropic | None = None,
    prompt_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Generate learning artifacts from evaluated sources.

    Makes 6 parallel Claude Opus calls for summary, concept_map, flashcards,
    timeline, conflicts, and assumptions.
    Assembles a 7th artifact (resources) directly from the source data.

    Args:
        prompt_overrides: Optional dict mapping artifact names to custom prompt
            templates. Keys: "summary", "concept_map", "flashcards",
            "timeline", "conflicts", "assumptions". Each template must
            contain a ``{context}`` placeholder.
    """
    overrides = prompt_overrides or {}

    # Build shared context once
    context = build_synthesis_context(topic, depth, sources)

    # Build kwargs for each generator (only pass prompt_template if overridden)
    gen_kwargs: dict[str, dict] = {}
    artifact_keys = ["summary", "concept_map", "flashcards", "timeline", "conflicts", "assumptions"]
    for key in artifact_keys:
        if key in overrides:
            gen_kwargs[key] = {"prompt_template": overrides[key]}
        else:
            gen_kwargs[key] = {}

    # Launch six calls in parallel
    results = await asyncio.gather(
        _generate_summary(context, client, **gen_kwargs["summary"]),
        _generate_concept_map(context, client, **gen_kwargs["concept_map"]),
        _generate_flashcards(context, client, **gen_kwargs["flashcards"]),
        _generate_timeline(context, client, **gen_kwargs["timeline"]),
        _generate_conflicts(context, client, **gen_kwargs["conflicts"]),
        _generate_assumptions(context, client, **gen_kwargs["assumptions"]),
        return_exceptions=True,
    )

    # Process results, handling exceptions
    summary = results[0] if not isinstance(results[0], Exception) else None
    concept_map = results[1] if not isinstance(results[1], Exception) else None
    flashcards = results[2] if not isinstance(results[2], Exception) else []
    timeline = results[3] if not isinstance(results[3], Exception) else []
    conflicts = results[4] if not isinstance(results[4], Exception) else []
    assumptions = results[5] if not isinstance(results[5], Exception) else []

    artifact_names = ["Summary", "Concept map", "Flashcards", "Timeline", "Conflicts", "Assumptions"]
    for i, name in enumerate(artifact_names):
        if isinstance(results[i], Exception):
            logger.warning("%s generation failed: %s", name, results[i])
        else:
            val = results[i]
            detail = f"{len(val)} items" if isinstance(val, list) else f"{len(val)} chars" if isinstance(val, str) else type(val).__name__
            logger.info("%s generated: %s", name, detail)

    # Resources artifact: assembled directly from source data
    resources = [source.model_dump() for source in sources]

    return {
        "summary": summary,
        "concept_map": concept_map,
        "flashcards": flashcards,
        "timeline": timeline,
        "conflicts": conflicts,
        "assumptions": assumptions,
        "resources": resources,
    }
