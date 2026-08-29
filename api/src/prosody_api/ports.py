from collections.abc import AsyncIterator, Callable
from typing import Protocol

from .schemas import Prosody


class LLMPort(Protocol):
    def stream(self, prompt: str) -> AsyncIterator[str]: ...


ConditionPromptBuilder = Callable[[str, Prosody | None], tuple[str, str]]
