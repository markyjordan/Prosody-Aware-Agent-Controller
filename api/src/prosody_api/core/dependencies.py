import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from .config import Settings
from ..ports import (
    ConditionPromptBuilder,
    LLMPort,
    ProsodyPredictorPort,
    TTSServicePort,
)
from .artifacts import ProsodyArtifactLocator


class Clock(Protocol):
    def monotonic(self) -> float: ...

    def time(self) -> float: ...


class RequestIdProvider(Protocol):
    def __call__(self) -> str: ...


class TaskSpawner(Protocol):
    def spawn(self, target: Callable[..., Any], *args: Any) -> None: ...


class SystemClock:
    def monotonic(self) -> float:
        return time.perf_counter()

    def time(self) -> float:
        return time.time()


class ShortUuidRequestIdProvider:
    def __call__(self) -> str:
        return str(uuid.uuid4())[:8]


class ThreadTaskSpawner:
    def spawn(self, target: Callable[..., Any], *args: Any) -> None:
        threading.Thread(target=target, args=args, daemon=True).start()


@dataclass(frozen=True)
class DependencyContainer:
    settings: Settings
    clock: Clock = field(default_factory=SystemClock)
    request_id_provider: RequestIdProvider = field(
        default_factory=ShortUuidRequestIdProvider
    )
    task_spawner: TaskSpawner = field(default_factory=ThreadTaskSpawner)
    llm: LLMPort | None = None
    condition_prompt_builder: ConditionPromptBuilder | None = None
    tts: TTSServicePort | None = None
    prosody_predictor: ProsodyPredictorPort | None = None
    prosody_artifacts: ProsodyArtifactLocator | None = None
