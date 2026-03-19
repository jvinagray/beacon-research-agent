"""Beacon pipeline: main orchestrator tying all modules together."""
import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from anthropic import AsyncAnthropic
from tavily import AsyncTavilyClient

from beacon.config import get_config, get_depth_settings
from beacon.evaluate import evaluate_sources
from beacon.extract import extract_content
from beacon.models import (
    ArtifactEvent,
    CompleteEvent,
    ErrorEvent,
    EvaluatedSource,
    Flashcard,
    PipelineEvent,
    ResearchResult,
    SourceEvaluatedEvent,
    SourcesFoundEvent,
    StatusEvent,
)
from beacon.search import search
from beacon.synthesize import synthesize

logger = logging.getLogger("beacon.pipeline")


async def run_research(
    topic: str,
    depth: str,
) -> AsyncGenerator[PipelineEvent, None]:
    """Main pipeline entry point. Yields events as research progresses.

    This is an async generator that orchestrates the full research pipeline:
    1. Search for sources
    2. Evaluate each source with Claude
    3. Extract full content from top sources
    4. Synthesize learning artifacts

    Yields real-time progress events for SSE consumption.

    Args:
        topic: The research topic to investigate.
        depth: One of 'quick', 'standard', 'deep'.

    Yields:
        PipelineEvent objects: StatusEvent, SourcesFoundEvent,
        SourceEvaluatedEvent, ArtifactEvent, ErrorEvent, CompleteEvent.
    """
    session_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    tasks: list[asyncio.Task] = []

    try:
        # --- Validate inputs and load config ---
        try:
            cfg = get_config()
            depth_config = get_depth_settings(depth)
        except Exception as e:
            logger.error("[%s] Config/depth validation failed: %s", session_id, e)
            yield ErrorEvent(message=str(e), recoverable=False)
            return

        # Create API clients for downstream modules
        anthropic_client = AsyncAnthropic(api_key=cfg.anthropic_api_key)
        tavily_client = AsyncTavilyClient(api_key=cfg.tavily_api_key)

        # --- SEARCH STAGE ---
        yield StatusEvent(message="Searching for sources...")
        try:
            sources = await search(topic, depth_config, client=tavily_client)
        except Exception as e:
            logger.error("[%s] Search failed: %s", session_id, e)
            yield ErrorEvent(message=f"Search failed: {e}", recoverable=False)
            return

        yield SourcesFoundEvent(count=len(sources), sources=sources)

        if not sources:
            yield ErrorEvent(
                message="No sources found for this topic.", recoverable=False
            )
            yield CompleteEvent(
                session_id=session_id,
                result=ResearchResult(
                    topic=topic,
                    depth=depth,
                    sources=[],
                    artifacts={},
                    session_id=session_id,
                    timestamp=timestamp,
                ),
            )
            return

        # --- EVALUATE STAGE ---
        yield StatusEvent(message="Evaluating sources...")

        queue: asyncio.Queue[EvaluatedSource] = asyncio.Queue()
        eval_task = asyncio.create_task(
            evaluate_sources(sources, topic, client=anthropic_client, queue=queue)
        )
        tasks.append(eval_task)

        # Yield to event loop so the task can start executing
        await asyncio.sleep(0)

        completed = 0
        total = len(sources)
        while completed < total:
            # If the task already finished, drain remaining queue items without blocking
            if eval_task.done():
                try:
                    evaluated_source = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
            else:
                try:
                    evaluated_source = await asyncio.wait_for(queue.get(), timeout=60)
                except asyncio.TimeoutError:
                    break
            completed += 1
            yield SourceEvaluatedEvent(
                index=completed,
                total=total,
                source=evaluated_source,
            )

        # Await eval_task, handling exceptions gracefully
        try:
            evaluated_sources = await eval_task
        except Exception as e:
            logger.error("[%s] Evaluation failed: %s", session_id, e)
            yield ErrorEvent(
                message=f"Source evaluation failed: {e}", recoverable=True
            )
            evaluated_sources = []
        finally:
            if eval_task in tasks:
                tasks.remove(eval_task)

        if not evaluated_sources:
            yield ErrorEvent(
                message="No sources could be evaluated.", recoverable=False
            )
            yield CompleteEvent(
                session_id=session_id,
                result=ResearchResult(
                    topic=topic,
                    depth=depth,
                    sources=[],
                    artifacts={},
                    session_id=session_id,
                    timestamp=timestamp,
                ),
            )
            return

        # Select top N for deep-read
        top_n = depth_config.get("deep_read_top_n", 3)
        top_sources = evaluated_sources[:top_n]

        # --- EXTRACT STAGE ---
        yield StatusEvent(message="Reading top sources...")
        try:
            extracted_sources = await extract_content(top_sources, client=tavily_client)
        except Exception as e:
            logger.error("[%s] Extraction failed: %s", session_id, e)
            yield ErrorEvent(
                message=f"Content extraction failed: {e}", recoverable=True
            )
            extracted_sources = top_sources

        # Merge extracted content back into the full evaluated list
        extracted_by_url = {s.url: s for s in extracted_sources}
        all_sources = []
        for s in evaluated_sources:
            if s.url in extracted_by_url:
                all_sources.append(extracted_by_url[s.url])
            else:
                all_sources.append(s)

        # --- SYNTHESIZE STAGE ---
        yield StatusEvent(message="Generating learning artifacts...")
        try:
            artifacts = await synthesize(
                all_sources, topic, depth, client=anthropic_client
            )
        except Exception as e:
            logger.error("[%s] Synthesis failed: %s", session_id, e)
            yield ErrorEvent(
                message=f"Synthesis failed: {e}", recoverable=True
            )
            artifacts = {}

        # Yield individual artifact events (skip empty collections)
        for artifact_type, data in artifacts.items():
            if data is None:
                continue
            if isinstance(data, list) and len(data) == 0:
                logger.info("Skipping empty artifact: %s", artifact_type)
                continue
            if isinstance(data, str):
                event_data: str | list[Flashcard] = data
            elif isinstance(data, list) and all(
                isinstance(item, Flashcard) for item in data
            ):
                # Serialize flashcards to JSON string to avoid Pydantic
                # union serialization issues with str | list[Flashcard]
                event_data = json.dumps(
                    [item.model_dump() for item in data]
                )
            else:
                event_data = json.dumps(data, default=str)
            yield ArtifactEvent(artifact_type=artifact_type, data=event_data)

        # --- COMPLETE ---
        yield CompleteEvent(
            session_id=session_id,
            result=ResearchResult(
                topic=topic,
                depth=depth,
                sources=all_sources,
                artifacts=artifacts,
                session_id=session_id,
                timestamp=timestamp,
            ),
        )

    except GeneratorExit:
        pass
    except Exception as e:
        logger.error("[%s] Unexpected pipeline error: %s", session_id, e)
        yield ErrorEvent(message=f"Unexpected error: {e}", recoverable=False)
        yield CompleteEvent(
            session_id=session_id,
            result=ResearchResult(
                topic=topic,
                depth=depth,
                sources=[],
                artifacts={},
                session_id=session_id,
                timestamp=timestamp,
            ),
        )
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        for task in tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
