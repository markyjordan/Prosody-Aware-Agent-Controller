from dataclasses import dataclass
from pathlib import Path

from .config import Settings, repo_root


@dataclass(frozen=True)
class ProsodyArtifact:
    configured_path: Path
    selected_path: Path
    found: bool


@dataclass(frozen=True)
class ProsodyArtifactLocator:
    configured_path: Path
    fallback_path: Path

    @classmethod
    def from_settings(cls, settings: Settings) -> "ProsodyArtifactLocator":
        return cls(
            configured_path=Path(settings["probe_path"]),
            fallback_path=repo_root / "research" / "artifacts" / "probe.pt",
        )

    def discover(self) -> ProsodyArtifact:
        if self.configured_path.exists():
            return ProsodyArtifact(
                configured_path=self.configured_path,
                selected_path=self.configured_path,
                found=True,
            )
        if self.fallback_path.exists():
            return ProsodyArtifact(
                configured_path=self.configured_path,
                selected_path=self.fallback_path,
                found=True,
            )
        return ProsodyArtifact(
            configured_path=self.configured_path,
            selected_path=self.configured_path,
            found=False,
        )
