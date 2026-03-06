"""Rewrite module: complexity-level summary rewriting with streaming."""
import json
import logging
from collections.abc import AsyncGenerator

from anthropic import AsyncAnthropic

from beacon.config import EVAL_MODEL, get_config
from beacon.models import ResearchResult

logger = logging.getLogger(__name__)

LEVEL_PROMPTS: dict[int, str] = {
    1: "Explain like I'm 8 years old. Use simple analogies, no jargon.",
    2: "Write for a high-school student. Define key terms when first used.",
    3: "General audience.",
    4: "Write for a working professional. Use technical terms freely.",
    5: "Write for a domain expert. Use precise language, include caveats and methodologies.",
}

_SYSTEM_PROMPT = (
    "You are a research communicator. Rewrite the following summary at the "
    "requested complexity level. Preserve all factual claims. Best-effort "
    "preserve citation links `[Title](cite:N)` and concept links "
    "`[text](drill://...)`. Keep markdown structure."
)


async def stream_rewrite(
    result: ResearchResult, level: int
) -> AsyncGenerator[str, None]:
    """Stream a summary rewrite at the requested complexity level."""
    summary = result.artifacts.get("summary", "")
    instruction = LEVEL_PROMPTS[level]

    messages = [
        {
            "role": "user",
            "content": (
                f"## Summary to rewrite\n\n{summary}\n\n"
                f"## Complexity instruction\n\n{instruction}"
            ),
        }
    ]

    config = get_config()
    client = AsyncAnthropic(api_key=config.anthropic_api_key)

    try:
        async with client.messages.stream(
            model=EVAL_MODEL,
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield json.dumps({"type": "delta", "content": text})

        yield json.dumps({"type": "done", "level": level})
    except Exception as e:
        logger.exception("Rewrite stream error")
        yield json.dumps({"type": "error", "message": str(e)})
