"""Venture character library and transactional Production casting."""

from __future__ import annotations

from typing import Protocol


class CastRepository(Protocol):
    def personas(self, venture_public_id: str) -> list[dict]: ...
    def create_persona(self, venture_public_id: str, values: dict) -> dict: ...
    def cast(self, production_public_id: str) -> list[dict]: ...
    def create_role(self, production_public_id: str, values: dict) -> dict: ...
    def recast(self, role_public_id: str, values: dict) -> dict: ...


class CastService:
    def __init__(self, repository: CastRepository):
        self.repository = repository

    def personas(self, venture_id: str) -> list[dict]:
        return self.repository.personas(venture_id)

    def create_persona(self, venture_id: str, values: dict) -> dict:
        return self.repository.create_persona(venture_id, values)

    def cast(self, production_id: str) -> list[dict]:
        return self.repository.cast(production_id)

    def create_role(self, production_id: str, values: dict) -> dict:
        return self.repository.create_role(production_id, values)

    def recast(self, role_id: str, values: dict) -> dict:
        return self.repository.recast(role_id, values)
