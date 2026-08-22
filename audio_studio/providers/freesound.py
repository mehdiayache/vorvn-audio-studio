"""Small Freesound API v2 adapter for discovery and original downloads."""

from __future__ import annotations

import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

from audio_studio.domain.audio_catalog import (
    AudioCatalogError,
    AudioCatalogSetupError,
    CatalogDownload,
    CatalogLicense,
    CatalogSound,
)


API_ROOT = "https://freesound.org/apiv2"
MAX_SOURCE_BYTES = 250_000_000
SEARCH_FIELDS = (
    "id,name,tags,username,license,duration,previews,url,type"
)
LICENSE_FILTERS = {
    "all": 'license:("Creative Commons 0" OR "Attribution" OR '
           '"Attribution NonCommercial")',
    "cc0": 'license:"Creative Commons 0"',
    "cc-by": 'license:"Attribution"',
    "cc-by-nc": 'license:"Attribution NonCommercial"',
}


def _license(value: object) -> tuple[CatalogLicense, str]:
    raw = str(value or "").strip()
    lowered = raw.casefold()
    if "noncommercial" in lowered or "/by-nc/" in lowered:
        return "cc-by-nc", (raw if raw.startswith("http") else
                            "https://creativecommons.org/licenses/by-nc/4.0/")
    if "creative commons 0" in lowered or "publicdomain/zero" in lowered:
        return "cc0", (raw if raw.startswith("http") else
                       "https://creativecommons.org/publicdomain/zero/1.0/")
    if "attribution" in lowered or "/licenses/by/" in lowered:
        return "cc-by", (raw if raw.startswith("http") else
                         "https://creativecommons.org/licenses/by/4.0/")
    raise AudioCatalogError("Freesound returned an unsupported license.")


def _preview(previews: object) -> str:
    values = previews if isinstance(previews, dict) else {}
    for key in ("preview-hq-mp3", "preview-lq-mp3",
                "preview-hq-ogg", "preview-lq-ogg"):
        value = values.get(key)
        if isinstance(value, str) and value.startswith("https://"):
            return value
    return ""


def _sound(raw: object) -> CatalogSound:
    if not isinstance(raw, dict):
        raise AudioCatalogError("Freesound returned an invalid sound record.")
    try:
        external_id = str(int(raw["id"]))
        name = str(raw["name"]).strip()
        duration_ms = max(1, round(float(raw["duration"]) * 1000))
        creator = str(raw["username"]).strip()
    except (KeyError, TypeError, ValueError) as exc:
        raise AudioCatalogError(
            "Freesound returned an incomplete sound record.") from exc
    license_id, license_url = _license(raw.get("license"))
    tags = tuple(
        str(item).strip().casefold() for item in (raw.get("tags") or [])
        if str(item).strip()
    )[:12]
    return CatalogSound(
        external_id=external_id,
        name=name or f"Freesound {external_id}",
        duration_ms=duration_ms,
        creator=creator or "Unknown creator",
        license=license_id,
        license_url=license_url,
        source_url=str(raw.get("url") or
                       f"https://freesound.org/s/{external_id}/"),
        preview_url=_preview(raw.get("previews")),
        original_format=str(raw.get("type") or "").strip().casefold(),
        tags=tags,
    )


class FreesoundCatalog:
    def __init__(self, *, api_root: str = API_ROOT,
                 opener=urllib.request.urlopen):
        self.api_root = api_root.rstrip("/")
        self.opener = opener

    @staticmethod
    def status() -> dict[str, bool]:
        return {
            "search_configured": bool(
                (os.getenv("FREESOUND_API_TOKEN") or "").strip()),
            "keep_configured": bool(
                (os.getenv("FREESOUND_OAUTH_ACCESS_TOKEN") or "").strip()),
        }

    @staticmethod
    def _token() -> str:
        token = (os.getenv("FREESOUND_API_TOKEN") or "").strip()
        if not token:
            raise AudioCatalogSetupError(
                "Add the Freesound API token in Settings before searching.")
        return token

    @staticmethod
    def _oauth_token() -> str:
        token = (os.getenv("FREESOUND_OAUTH_ACCESS_TOKEN") or "").strip()
        if not token:
            raise AudioCatalogSetupError(
                "Add Freesound OAuth download access in Settings before "
                "keeping original audio.")
        return token

    def _json(self, path: str, *, token: str) -> object:
        request = urllib.request.Request(
            f"{self.api_root}{path}",
            headers={"Authorization": f"Token {token}",
                     "Accept": "application/json"},
        )
        try:
            with self.opener(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise AudioCatalogSetupError(
                    "Freesound rejected the saved API token.") from exc
            raise AudioCatalogError(
                f"Freesound search failed ({exc.code}). Try again.") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise AudioCatalogError(
                "Freesound could not be reached. Try again.") from exc

    def search(self, query: str, *, license_filter: str = "all",
               duration_min: float | None = None,
               duration_max: float | None = None) -> list[CatalogSound]:
        if license_filter not in LICENSE_FILTERS:
            raise ValueError("Choose a valid Freesound license filter.")
        filters = [LICENSE_FILTERS[license_filter]]
        if duration_min is not None or duration_max is not None:
            lower = max(0, duration_min or 0)
            upper = "*" if duration_max is None else str(max(lower, duration_max))
            filters.append(f"duration:[{lower:g} TO {upper}]")
        parameters = urllib.parse.urlencode({
            "query": query.strip(),
            "filter": " ".join(filters),
            "fields": SEARCH_FIELDS,
            "page_size": "24",
        })
        payload = self._json(f"/search/?{parameters}", token=self._token())
        if not isinstance(payload, dict) or not isinstance(
                payload.get("results"), list):
            raise AudioCatalogError("Freesound returned an invalid search response.")
        return [_sound(item) for item in payload["results"]]

    def sound(self, external_id: str) -> CatalogSound:
        try:
            sound_id = str(int(external_id))
        except (TypeError, ValueError) as exc:
            raise AudioCatalogError("That Freesound result is invalid.") from exc
        parameters = urllib.parse.urlencode({"fields": SEARCH_FIELDS})
        return _sound(self._json(
            f"/sounds/{sound_id}/?{parameters}", token=self._token()))

    def download(self, sound: CatalogSound, target: Path) -> CatalogDownload:
        request = urllib.request.Request(
            f"{self.api_root}/sounds/{sound.external_id}/download/",
            headers={"Authorization": f"Bearer {self._oauth_token()}"},
        )
        try:
            with self.opener(request, timeout=120) as response:
                length = int(response.headers.get("Content-Length") or 0)
                if length > MAX_SOURCE_BYTES:
                    raise AudioCatalogError(
                        "That Freesound source is over the 250 MB limit.")
                size = 0
                with target.open("wb") as handle:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_SOURCE_BYTES:
                            raise AudioCatalogError(
                                "That Freesound source is over the 250 MB limit.")
                        handle.write(chunk)
        except urllib.error.HTTPError as exc:
            target.unlink(missing_ok=True)
            if exc.code in {401, 403}:
                raise AudioCatalogSetupError(
                    "Freesound rejected the saved OAuth download access.") from exc
            if exc.code == 404:
                raise AudioCatalogError(
                    "That Freesound source is no longer available.") from exc
            raise AudioCatalogError(
                f"Freesound could not download the original ({exc.code}).") from exc
        except (OSError, TimeoutError):
            target.unlink(missing_ok=True)
            raise AudioCatalogError(
                "The Freesound source download did not complete. Try again.")
        if not target.is_file() or target.stat().st_size <= 0:
            target.unlink(missing_ok=True)
            raise AudioCatalogError("Freesound returned an empty source file.")
        extension = sound.original_format.lstrip(".") or "audio"
        original_name = (sound.name if Path(sound.name).suffix else
                         f"{sound.name}.{extension}")
        return CatalogDownload(
            path=str(target), original_name=original_name,
            size_bytes=target.stat().st_size)
