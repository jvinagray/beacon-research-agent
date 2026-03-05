"""Route definitions for the Beacon API."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from sse_starlette import EventSourceResponse

from server.export import generate_markdown, topic_slug
from server.models import ResearchRequest
from server.sse import stream_research

router = APIRouter()


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
