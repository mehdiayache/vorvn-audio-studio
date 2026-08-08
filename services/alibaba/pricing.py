"""Versioned Alibaba catalogue pricing used for operator-facing accounting.

This module never claims to reproduce an Alibaba invoice.  It records the
public catalogue price applicable to the measured usage; free quotas, credits
and promotions are reconciled separately when billing data is available.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal, ROUND_HALF_UP


PRICE_VERSION = "alibaba-model-pricing-2026-07-15"
ASR_MODEL = "qwen3-asr-flash-filetrans"
ASR_USD_PER_SECOND = {
    "intl": Decimal("0.000035"),
    "beijing": Decimal("0.000032"),
}
TTS_USD_PER_MILLION_CHARACTERS = {
    "intl": {"plus": Decimal("20"), "flash": Decimal("15")},
    "beijing": {"plus": Decimal("19.253"),
                "flash": Decimal("13.7521")},
}


@dataclass(frozen=True)
class CatalogueCost:
    model: str
    provider_region: str
    duration_ms: int
    quantity_seconds: str
    catalog_rate: str
    catalog_cost: float
    currency: str = "USD"
    cost_basis: str = "catalog_duration"
    price_version: str = PRICE_VERSION

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CharacterCost:
    model: str
    provider_region: str
    characters: int
    catalog_rate: str
    catalog_cost: float
    currency: str = "USD"
    cost_basis: str = "catalog_characters"
    price_version: str = PRICE_VERSION

    def as_dict(self) -> dict:
        return asdict(self)


def transcription_cost(duration_ms: int | float | None, region: str = "intl",
                       model: str = ASR_MODEL) -> CatalogueCost:
    """Price measured audio duration without rounding it up to a minute."""
    safe_region = "beijing" if region == "beijing" else "intl"
    safe_duration = max(0, int(duration_ms or 0))
    seconds = Decimal(safe_duration) / Decimal(1000)
    rate = ASR_USD_PER_SECOND[safe_region]
    cost = (seconds * rate).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    return CatalogueCost(
        model=model,
        provider_region=safe_region,
        duration_ms=safe_duration,
        quantity_seconds=format(seconds.normalize(), "f") if seconds else "0",
        catalog_rate=format(rate, "f"),
        catalog_cost=float(cost),
    )


def qwen_audio_tts_cost(characters: int, region: str = "intl",
                        tier: str = "plus") -> CharacterCost:
    """Price Qwen Audio TTS input characters at the regional catalogue rate."""
    safe_region = "beijing" if region == "beijing" else "intl"
    safe_tier = tier if tier in {"plus", "flash"} else "plus"
    safe_characters = max(0, int(characters or 0))
    rate = TTS_USD_PER_MILLION_CHARACTERS[safe_region][safe_tier]
    cost = (Decimal(safe_characters) * rate / Decimal(1_000_000)).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP)
    return CharacterCost(
        model=f"qwen-audio-3.0-tts-{safe_tier}",
        provider_region=safe_region,
        characters=safe_characters,
        catalog_rate=format(rate, "f"),
        catalog_cost=float(cost),
    )
