"""Runtime configuration with one authoritative environment boundary."""

from __future__ import annotations

from dataclasses import dataclass
import os
import ipaddress
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


@dataclass(frozen=True, slots=True)
class AlibabaEnvironment:
    """Current non-secret provider deployment selected for this process.

    This value is deliberately created on demand. The worker refreshes its
    owned environment without restarting, so freezing these values at import
    time would send jobs to the previous region or workspace.
    """

    region: str
    workspace_id: str
    api_key_configured: bool

    @property
    def region_label(self) -> str:
        return "Beijing" if self.region == "beijing" else "Singapore"

    @property
    def native_http_base(self) -> str:
        if self.workspace_id:
            zone = "cn-beijing" if self.region == "beijing" else "ap-southeast-1"
            return f"https://{self.workspace_id}.{zone}.maas.aliyuncs.com/api/v1"
        host = ("dashscope.aliyuncs.com" if self.region == "beijing"
                else "dashscope-intl.aliyuncs.com")
        return f"https://{host}/api/v1"


def alibaba_environment() -> AlibabaEnvironment:
    """Read the current Alibaba deployment without exposing its API key."""
    region = (os.getenv("DASHSCOPE_REGION") or "intl").strip().casefold()
    return AlibabaEnvironment(
        region="beijing" if region == "beijing" else "intl",
        workspace_id=(os.getenv("DASHSCOPE_WORKSPACE_ID") or "").strip(),
        api_key_configured=bool((os.getenv("DASHSCOPE_API_KEY") or "").strip()),
    )


def require_local_bind() -> None:
    """Fail closed until authentication and tenant authorization exist."""
    host = settings.host.strip().casefold()
    if host == "localhost":
        return
    try:
        if ipaddress.ip_address(host).is_loopback:
            return
    except ValueError:
        pass
    raise RuntimeError(
        "Audio Studio has no remote authentication yet. "
        "AUDIO_STUDIO_HOST must remain a loopback address."
    )
