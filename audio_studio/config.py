"""Runtime configuration with one authoritative environment boundary."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True, slots=True)
class Settings:
    name: str = "VORVN Audio Studio"
    host: str = "127.0.0.1"
    port: int = 7860
    web_prefix: str = "/audio-studio"
    database_url: str = "postgresql://voicestudio:voicestudio@127.0.0.1:5434/voicestudio"
    root: Path = ROOT
    web_build: Path = ROOT / "ui-next"
    output_dir: Path = ROOT / "out"
    voice_samples: Path = ROOT / ".voice-samples"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=os.getenv("AUDIO_STUDIO_HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "7860")),
            database_url=os.getenv(
                "DATABASE_URL",
                "postgresql://voicestudio:voicestudio@127.0.0.1:5434/voicestudio",
            ),
            output_dir=Path(os.getenv("AUDIO_STUDIO_OUTPUT_DIR", str(ROOT / "out"))),
        )
settings = Settings.from_env()
