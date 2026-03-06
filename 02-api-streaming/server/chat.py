"""Chat module: context builder and streaming response generator."""
import json
import logging
from collections.abc import AsyncGenerator

from anthropic import AsyncAnthropic

from beacon.config import EVAL_MODEL, get_config
from beacon.models import ResearchResult
from server.models import ChatMessage

logger = logging.getLogger(__name__)

_MAX_SUMMARY_CHARS = 3000
_MAX_DEEP_READ_CHARS = 4000
_TOP_SOURCES_COUNT = 8


def _select_top_sources(result: ResearchResult) -> list:
    """Select top sources by learning efficiency score."""
    return sorted(
        result.sources,
        key=lambda s: s.signals.learning_efficiency_score,
        reverse=True,
    )[:_TOP_SOURCES_COUNT]


def build_chat_context(result: ResearchResult) -> str:
    """Build the system prompt string from a ResearchResult."""
    parts: list[str] = []

    parts.append(
        "You are a research assistant. Answer questions based on the sources below. "
        "Cite sources by title when relevant."
    )

    summary = result.artifacts.get("summary", "")
    if summary:
        parts.append(f"\n## Overview\n\n{summary[:_MAX_SUMMARY_CHARS]}")

    top_sources = _select_top_sources(result)

    if top_sources:
        parts.append("\n## Sources\n")

    for source in top_sources:
        content = source.deep_read_content
        if content is not None:
            content = content[:_MAX_DEEP_READ_CHARS]
        else:
            content = source.snippet

        parts.append(
            f"### {source.title}\n"
            f"URL: {source.url}\n"
            f"Key insight: {source.signals.key_insight}\n"
            f"Score: {source.signals.learning_efficiency_score}\n"
            f"Content: {content}\n"
        )

    return "\n".join(parts)


async def stream_chat_response(
    result: ResearchResult, message: str, history: list[ChatMessage]
) -> AsyncGenerator[str, None]:
    """Stream a chat response as JSON-encoded SSE data lines."""
    system_prompt = build_chat_context(result)
    top_sources = _select_top_sources(result)

    messages = [{"role": msg.role, "content": msg.content} for msg in history]
    messages.append({"role": "user", "content": message})

    config = get_config()
    client = AsyncAnthropic(api_key=config.anthropic_api_key)

    try:
        async with client.messages.stream(
            model=EVAL_MODEL,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield json.dumps({"type": "delta", "content": text})

        yield json.dumps(
            {
                "type": "done",
                "sources": [
                    {"title": s.title, "url": s.url} for s in top_sources
                ],
            }
        )
    except Exception as e:
        logger.exception("Chat stream error")
        yield json.dumps({"type": "error", "message": str(e)})
