"""Explicit bulk enrollment of existing identities and references."""

from __future__ import annotations

from typing import Protocol


class BulkEnrollmentStore(Protocol):
    def preflight(self, provider_model_id: str,
                  selections: list[dict]) -> dict: ...
    def create_campaign(self, provider_model_id: str,
                        selections: list[dict]) -> dict: ...
    def campaign(self, campaign_id: str) -> dict | None: ...
    def cancel_campaign(self, campaign_id: str) -> dict | None: ...
    def retry_items(self, campaign_id: str,
                    item_ids: list[str]) -> dict | None: ...


class BulkEnrollmentService:
    def __init__(self, store: BulkEnrollmentStore):
        self.store = store

    def preflight(self, provider_model_id: str,
                  selections: list[dict]) -> dict:
        if not provider_model_id.strip():
            raise ValueError("Choose an installed provider model.")
        if not selections:
            raise ValueError("Select at least one voice and reference.")
        return self.store.preflight(provider_model_id.strip(), selections)

    def create(self, provider_model_id: str, selections: list[dict],
               confirmed: bool) -> dict:
        preview = self.preflight(provider_model_id, selections)
        if not confirmed:
            return {**preview, "needs_confirmation": True}
        return self.store.create_campaign(provider_model_id.strip(), selections)

    def get(self, campaign_id: str) -> dict:
        result = self.store.campaign(campaign_id)
        if not result:
            raise LookupError("That enrollment campaign does not exist.")
        return result

    def cancel(self, campaign_id: str) -> dict:
        result = self.store.cancel_campaign(campaign_id)
        if not result:
            raise LookupError("That enrollment campaign does not exist.")
        return result

    def retry(self, campaign_id: str, item_ids: list[str]) -> dict:
        if not item_ids:
            raise ValueError("Choose at least one failed campaign item.")
        result = self.store.retry_items(campaign_id, item_ids)
        if not result:
            raise LookupError("That enrollment campaign does not exist.")
        return result
