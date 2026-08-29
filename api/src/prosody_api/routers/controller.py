import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import json

from ..schemas import ConditionRequest
from ..services.controller_service import build_requests
from ..services.llm_service import stream_llm
from ..services.tts_service import prefetch
from ..schemas import Prosody

router = APIRouter()


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/api/condition/{branch}")
async def condition(branch: str, req: ConditionRequest, request: Request):
    # branch = baseline | prosodic
    transcript = req.turn.get("transcript", "") if req.turn else ""
    prosody_dict = req.turn.get("prosody") if req.turn and req.turn.get("prosody") else req.prosody
    prosody = Prosody(**prosody_dict) if isinstance(prosody_dict, dict) else None

    # agent controller: infer policy
    baseline_prompt, conditioned_prompt = build_requests(transcript, prosody)
    prompt = conditioned_prompt if branch == "prosodic" else baseline_prompt

    async def gen():
        try:
            async for delta in stream_llm(prompt):
                if await request.is_disconnected():
                    break
                yield _sse({"type": "delta", "text": delta})
            yield _sse({"type": "done"})
            # fire-and-forget TTS pre-cache for play button latency (your #3)
            # collect full text for cache — we need to buffer deltas
            # for now, prefetch after streaming using the final prompt's expected answer would require full text
            # stub: prefetch the transcript's branch prompt's first 500 chars as placeholder
            # real: prefetch the streamed LLM output text
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})

    # wrap to also prefetch TTS after streaming completes
    # we need to capture full response text for caching
    full_text_parts = []

    async def caching_gen():
        async for chunk in gen():
            # chunk is sse string, extract delta text for caching
            if '"type": "delta"' in chunk:
                try:
                    data = json.loads(chunk.split("data: ", 1)[1])
                    if data.get("text"):
                        full_text_parts.append(data["text"])
                except Exception:
                    pass
            yield chunk
        # after done, prefetch TTS in background
        full_text = "".join(full_text_parts).strip()
        if full_text:
            # run in thread to not block
            import threading

            threading.Thread(target=prefetch, args=(full_text,), daemon=True).start()

    return StreamingResponse(caching_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
