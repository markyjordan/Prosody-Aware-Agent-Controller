"""
LLM inference — OpenAI Responses streaming per branch.

Used by both the compatibility condition SSE routes and the unified audio
WebSocket orchestrator through the same injectable LLM port.
"""
from typing import AsyncIterator

from ..core.config import get_settings

# lazy import openai
try:
    from openai import AsyncOpenAI  # type: ignore
except ImportError:
    AsyncOpenAI = None  # type: ignore


def _get_client():
    settings = get_settings()
    key = settings["openai_api_key"]
    if not key:
        return None
    if AsyncOpenAI is None:
        return None
    return AsyncOpenAI(api_key=key)


async def stream_llm(prompt: str) -> AsyncIterator[str]:
    """Stub — streams mock deltas if no key, else OpenAI."""
    client = _get_client()
    settings = get_settings()
    if not client:
        # mock fallback mirroring scenarios.mjs baseline
        for w in (prompt[:80] + " (mock LLM)").split():
            yield w + " "
        return
    async with client.responses.stream(
        model=settings["openai_model"],
        input=prompt,
        reasoning={"effort": settings["openai_reasoning_effort"]},
        max_output_tokens=settings["openai_max_output_tokens"],
        store=False,
    ) as stream:
        async for event in stream:
            if event.type == "response.output_text.delta" and event.delta:
                yield event.delta
