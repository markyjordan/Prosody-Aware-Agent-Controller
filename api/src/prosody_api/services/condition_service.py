from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import TypedDict

from ..ports import ConditionPromptBuilder, LLMPort
from ..schemas import ConditionRequest, Prosody


class ConditionEvent(TypedDict, total=False):
    type: str
    text: str
    message: str


@dataclass(frozen=True)
class CallableLLM:
    stream_tokens: Callable[[str], AsyncIterator[str]]

    def stream(self, prompt: str) -> AsyncIterator[str]:
        return self.stream_tokens(prompt)


@dataclass(frozen=True)
class ConditionOrchestrator:
    llm: LLMPort
    build_prompts: ConditionPromptBuilder

    def prompt_for(self, branch: str, request: ConditionRequest) -> str:
        transcript = request.turn.get("transcript", "") if request.turn else ""
        prosody_data = (
            request.turn.get("prosody")
            if request.turn and request.turn.get("prosody")
            else request.prosody
        )
        # Preserve the established behavior: top-level Prosody models are ignored.
        prosody = Prosody(**prosody_data) if isinstance(prosody_data, dict) else None
        baseline, conditioned = self.build_prompts(transcript, prosody)
        return conditioned if branch == "prosodic" else baseline

    async def events(
        self,
        branch: str,
        request: ConditionRequest,
        is_disconnected: Callable[[], Awaitable[bool]],
    ) -> AsyncIterator[ConditionEvent]:
        prompt = self.prompt_for(branch, request)
        try:
            async for delta in self.llm.stream(prompt):
                if await is_disconnected():
                    break
                yield {"type": "delta", "text": delta}
            yield {"type": "done"}
        except Exception as error:
            yield {"type": "error", "message": str(error)}
