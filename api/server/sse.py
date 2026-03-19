"""SSE streaming: convert pipeline events to Server-Sent Events."""
from collections.abc import AsyncGenerator

from sse_starlette import ServerSentEvent
from starlette.requests import Request

from beacon.models import CompleteEvent, PipelineEvent
from beacon.pipeline import run_research
from server.models import CompleteSummary, ResearchRequest, ResearchSummary
from server.sessions import SessionStore


def format_sse_event(event: PipelineEvent, event_id: int) -> ServerSentEvent:
    """Convert a pipeline event into an SSE ServerSentEvent.

    Uses the event's type field as the SSE event name.
    Serializes the event data as JSON.

    Special handling for CompleteEvent: sends a CompleteSummary
    instead of the full ResearchResult to avoid sending large
    deep-read content over SSE.
    """
    event_type = event.type

    if isinstance(event, CompleteEvent):
        summary = CompleteSummary(
            session_id=event.session_id,
            summary=ResearchSummary(
                topic=event.result.topic,
                depth=event.result.depth,
                source_count=len(event.result.sources),
                artifact_types=sorted(event.result.artifacts.keys()),
            ),
        )
        data = summary.model_dump_json()
    else:
        data = event.model_dump_json()

    return ServerSentEvent(data=data, event=event_type, id=str(event_id))


async def stream_research(
    request: Request,
    research_request: ResearchRequest,
    sessions: SessionStore,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Stream pipeline events as SSE.

    Wraps run_research(), formats each event as a ServerSentEvent,
    checks for client disconnects, and stores meaningful results
    in the session store on completion.
    """
    event_id = 0
    async for event in run_research(
        research_request.topic, research_request.depth
    ):
        if await request.is_disconnected():
            break

        event_id += 1
        yield format_sse_event(event, event_id)

        if isinstance(event, CompleteEvent):
            has_sources = len(event.result.sources) > 0
            has_artifacts = len(event.result.artifacts) > 0
            if has_sources or has_artifacts:
                await sessions.store(event.result.session_id, event.result)
