"""Drilldown module: streaming focused sub-research on specific concepts."""
import json
import logging
from collections.abc import AsyncGenerator

from anthropic import AsyncAnthropic

from beacon.config import EVAL_MODEL, get_config
from beacon.models import ResearchResult
from server.chat import build_chat_context

logger = logging.getLogger(__name__)

_DRILLDOWN_INSTRUCTIONS = """\
You are a research analyst performing a deep dive into a specific concept. \
Structure your response as:

1. **Definition/Explanation** - What this concept means in context
2. **Key Evidence** - What the sources say about it
3. **Controversies/Limitations** - Any debates or caveats
4. **Relationship to Broader Topic** - How it connects to the main research

Ground your analysis in the source material. Include citation links [Title](cite:N). \
For 2-3 sub-concepts worth exploring further, include [text](drill://concept text) links \
(no URL encoding - use plain text after drill://)."""


async def stream_drilldown(
    result: ResearchResult, concept: str
) -> AsyncGenerator[str, None]:
    """Stream a focused sub-research response on a concept."""
    context = build_chat_context(result)
    system_prompt = context + "\n\n" + _DRILLDOWN_INSTRUCTIONS

    messages = [{"role": "user", "content": f"Deep dive into: {concept}"}]

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

        yield json.dumps({"type": "done", "concept": concept})
    except Exception as e:
        logger.exception("Drilldown stream error")
        yield json.dumps({"type": "error", "message": str(e)})
