"""Deployment-owned media and object-storage facts exposed to the catalogue."""

from origins.infrastructure import object_storage
from origins.infrastructure.media_paths import media_root


class CatalogEnvironment:
    def media_root(self) -> str:
        return str(media_root())

    def storage_status(self) -> dict:
        return object_storage.status()

    def storage_settings(self) -> dict:
        return {
            key: value for key, value in object_storage.settings().items()
            if "key" not in key
        }
