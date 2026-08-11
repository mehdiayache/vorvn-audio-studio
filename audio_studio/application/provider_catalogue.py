"""Application boundary for refreshing technical provider catalogue data."""

from typing import Protocol


class ProviderCatalogueStore(Protocol):
    def refresh_documented_snapshot(self) -> int: ...


class ProviderCatalogueSync:
    def __init__(self, store: ProviderCatalogueStore):
        self.store = store

    def refresh(self) -> int:
        return self.store.refresh_documented_snapshot()
