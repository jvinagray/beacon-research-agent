"""Route definitions for the Beacon API."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from sse_starlette import EventSourceResponse

from server.chat import stream_chat_response
from server.drilldown import stream_drilldown
from server.export import generate_markdown, topic_slug
from server.models import ChatRequest, DrillDownRequest, ResearchRequest, RewriteRequest
from server.rewrite import stream_rewrite
from server.sse import stream_research

router = APIRouter()

_active_chat_streams: dict[str, bool] = {}
_active_drilldown_streams: dict[str, bool] = {}
_active_rewrite_streams: dict[str, bool] = {}


@router.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@router.post("/api/research")
async def research(request: Request, body: ResearchRequest):
    """Start a research run and stream progress as SSE."""
    semaphore = request.app.state.research_semaphore
    sessions = request.app.state.sessions

    # Non-blocking acquire: check if a slot is available, then acquire.
    # Safe in asyncio's cooperative model (no await between check and acquire).
    if semaphore.locked():
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent research requests. Please try again later.",
        )
    await semaphore.acquire()

    async def _stream():
        try:
            async for event in stream_research(request, body, sessions):
                yield event
        finally:
            semaphore.release()

    return EventSourceResponse(
        _stream(),
        ping=15,
        send_timeout=30,
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


@router.get("/api/export/{session_id}")
async def export(request: Request, session_id: str):
    """Export research results as a downloadable Markdown document."""
    sessions = request.app.state.sessions
    result = await sessions.get(session_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    markdown = generate_markdown(result)
    slug = topic_slug(result.topic)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"beacon-research-{slug}-{date_str}.md"

    return Response(
        content=markdown,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("/api/chat/{session_id}")
async def chat(request: Request, session_id: str, body: ChatRequest):
    """Stream a chat response grounded in research results."""
    sessions = request.app.state.sessions
    result = await sessions.get(session_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    if session_id in _active_chat_streams:
        raise HTTPException(
            status_code=429,
            detail="A chat stream is already active for this session.",
        )

    _active_chat_streams[session_id] = True

    async def _stream():
        try:
            async for chunk in stream_chat_response(
                result, body.message, body.history
            ):
                yield chunk
        finally:
            _active_chat_streams.pop(session_id, None)

    return EventSourceResponse(
        _stream(),
        ping=15,
        send_timeout=30,
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


@router.post("/api/rewrite/{session_id}")
async def rewrite(request: Request, session_id: str, body: RewriteRequest):
    """Stream a summary rewrite at the requested complexity level."""
    sessions = request.app.state.sessions
    result = await sessions.get(session_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    if session_id in _active_rewrite_streams:
        raise HTTPException(
            status_code=429,
            detail="A rewrite stream is already active for this session.",
        )

    _active_rewrite_streams[session_id] = True

    async def _stream():
        try:
            async for chunk in stream_rewrite(result, body.level):
                yield chunk
        finally:
            _active_rewrite_streams.pop(session_id, None)

    return EventSourceResponse(
        _stream(),
        ping=15,
        send_timeout=30,
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )


@router.post("/api/drilldown/{session_id}")
async def drilldown(request: Request, session_id: str, body: DrillDownRequest):
    """Stream a focused sub-research deep dive on a concept."""
    sessions = request.app.state.sessions
    result = await sessions.get(session_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    if session_id in _active_drilldown_streams:
        raise HTTPException(
            status_code=429,
            detail="A drilldown stream is already active for this session.",
        )

    _active_drilldown_streams[session_id] = True

    async def _stream():
        try:
            async for chunk in stream_drilldown(result, body.concept):
                yield chunk
        finally:
            _active_drilldown_streams.pop(session_id, None)

    return EventSourceResponse(
        _stream(),
        ping=15,
        send_timeout=30,
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )
