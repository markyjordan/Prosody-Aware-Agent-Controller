import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..schemas import ConditionRequest
from ..services.controller_service import build_requests
from ..services.condition_service import CallableLLM, ConditionOrchestrator
from ..services.llm_service import stream_llm
from ..services.tts_service import prefetch

router = APIRouter()


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/api/condition/{branch}")
async def condition(branch: str, req: ConditionRequest, request: Request):
    dependencies = request.app.state.dependencies
    orchestrator = ConditionOrchestrator(
        llm=dependencies.llm or CallableLLM(stream_llm),
        build_prompts=dependencies.condition_prompt_builder or build_requests,
    )

    async def caching_gen():
        full_text_parts = []
        async for event in orchestrator.events(branch, req, request.is_disconnected):
            if event["type"] == "delta" and event.get("text"):
                full_text_parts.append(event["text"])
            yield _sse(event)

        full_text = "".join(full_text_parts).strip()
        if full_text:
            dependencies.task_spawner.spawn(prefetch, full_text)

    return StreamingResponse(
        caching_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
