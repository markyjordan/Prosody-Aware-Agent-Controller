"""
LLM inference — OpenAI streaming per branch

Called from routers/controller.py after aggregator + controller produce baseline/conditioned prompts.
Streams deltas as SSE text/event-stream (like mock/server.mjs streamSSE).
"""
import os
from typing import AsyncIterator, Iterator

from ..core.config import get_settings

# lazy import openai
try:
    from openai import OpenAI  # type: ignore
except ImportError:
    OpenAI = None  # type: ignore


def _get_client():
    settings = get_settings()
    key = settings["openai_api_key"]
    if not key:
        return None
    if OpenAI is None:
        return None
    return OpenAI(api_key=key)


async def stream_llm(prompt: str) -> AsyncIterator[str]:
    """Stub — streams mock deltas if no key, else OpenAI."""
    client = _get_client()
    settings = get_settings()
    if not client:
        # mock fallback mirroring scenarios.mjs baseline
        for w in (prompt[:80] + " (mock LLM)").split():
            yield w + " "
        return
    # real OpenAI streaming
    # TODO: choose model from config
    stream = client.chat.completions.create(
        model=settings["openai_model"],
        messages=[{"role": "user", "content": prompt}],
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
