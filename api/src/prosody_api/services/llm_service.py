"""
LLM inference — Groq Chat Completions streaming per branch.

Used by both the compatibility condition SSE routes and the unified audio
WebSocket orchestrator through the same injectable LLM port.
"""
from typing import AsyncIterator

from ..core.config import get_settings

# lazy import Groq
try:
    from groq import AsyncGroq  # type: ignore
except ImportError:
    AsyncGroq = None  # type: ignore


def _get_client():
    settings = get_settings()
    key = settings["groq_api_key"]
    if not key:
        return None
    if AsyncGroq is None:
        return None
    return AsyncGroq(api_key=key)


async def stream_llm(prompt: str) -> AsyncIterator[str]:
    """Stream mock deltas without credentials, otherwise use Groq."""
    client = _get_client()
    settings = get_settings()
    if not client:
        # mock fallback mirroring scenarios.mjs baseline
        for w in (prompt[:80] + " (mock LLM)").split():
            yield w + " "
        return
    stream = await client.chat.completions.create(
        model=settings["groq_model"],
        messages=[{"role": "user", "content": prompt}],
        temperature=settings["groq_temperature"],
        max_completion_tokens=settings["groq_max_completion_tokens"],
        top_p=settings["groq_top_p"],
        reasoning_effort=settings["groq_reasoning_effort"],
        stream=True,
        stop=None,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
