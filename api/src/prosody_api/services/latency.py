import json
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


@dataclass
class TurnTrace:
    session_id: str
    turn_id: str
    scenario: str | None
    clock: Callable[[], float]
    cold: bool = False
    started_at: float = field(init=False)
    marks: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.started_at = self.clock()

    def mark(self, name: str) -> None:
        self.marks.setdefault(name, self.clock())

    def ms(self, start: str, end: str) -> float | None:
        if start not in self.marks or end not in self.marks:
            return None
        return round((self.marks[end] - self.marks[start]) * 1000, 3)

    def offsets_ms(self) -> dict[str, float]:
        return {
            name: round((value - self.started_at) * 1000, 3)
            for name, value in self.marks.items()
        }


class JsonlLatencySink:
    """Append-only, content-free latency records for local profiling."""

    def __init__(self, path: Path | None):
        self.path = path
        self._lock = threading.Lock()

    def append(self, record: dict) -> None:
        if self.path is None:
            return
        payload = json.dumps(record, separators=(",", ":"), sort_keys=True)
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as output:
                output.write(payload + "\n")
