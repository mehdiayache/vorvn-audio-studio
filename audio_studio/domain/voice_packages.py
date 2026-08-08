"""Provider-neutral values for cloned-voice package execution."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class VoicePackageJob:
    id: str
    identity_id: str
    reference_id: str
    model_id: str
    engine: str
    tier: str
    attempts: int
    name: str
    metadata: dict


@dataclass(frozen=True, slots=True)
class CreatedVoiceBinding:
    provider_voice_id: str
    provider_region: str
    provider_endpoint: str
    price_version: str
    estimated_cost: float
    cost: float
    cost_basis: str
