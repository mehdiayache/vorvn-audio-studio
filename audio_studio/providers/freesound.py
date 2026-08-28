"""Small Freesound API v2 adapter for discovery and original downloads."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
from threading import Lock
import time
from typing import Callable
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
AUTHORIZE_URL = f"{API_ROOT}/oauth2/authorize/"
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


@dataclass(frozen=True, slots=True)
class FreesoundOAuthTokens:
    access_token: str
    refresh_token: str
    expires_at: int


def _environment_value(key: str) -> str:
    return (os.getenv(key) or "").strip()


def _expiry() -> int:
    try:
        return int(float(_environment_value("FREESOUND_OAUTH_EXPIRES_AT")))
    except ValueError:
        return 0


def freesound_status(*, now: float | None = None) -> dict[str, object]:
    """Report executable readiness, not merely the presence of old secrets."""
    api_token = bool((os.getenv("FREESOUND_API_TOKEN") or "").strip())
    client_id = _environment_value("FREESOUND_CLIENT_ID")
    refresh_token = _environment_value("FREESOUND_OAUTH_REFRESH_TOKEN")
    access_token = _environment_value("FREESOUND_OAUTH_ACCESS_TOKEN")
    current_time = time.time() if now is None else now
    access_valid = bool(access_token and _expiry() > int(current_time) + 30)
    refresh_ready = bool(client_id and api_token and refresh_token)
    keep_ready = bool(api_token and (access_valid or refresh_ready))
    if keep_ready:
        reason = ""
    elif not api_token:
        reason = "Add the Freesound API token."
    elif not client_id:
        reason = "Add the Freesound Client ID, then authorize original downloads."
    else:
        reason = "Reconnect Freesound to authorize original downloads."
    authorization_url = ""
    if client_id:
        authorization_url = (
            f"{AUTHORIZE_URL}?" + urllib.parse.urlencode({
                "client_id": client_id,
                "response_type": "code",
            })
        )
    return {
        "search_configured": api_token,
        "oauth_client_configured": bool(client_id and api_token),
        "keep_configured": keep_ready,
        "keep_reason": reason,
        "authorization_url": authorization_url,
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
                 opener=urllib.request.urlopen,
                 save_oauth_tokens: Callable[[FreesoundOAuthTokens], None]
                 | None = None,
                 clock: Callable[[], float] = time.time):
        self.api_root = api_root.rstrip("/")
        self.opener = opener
        self.save_oauth_tokens = save_oauth_tokens
        self.clock = clock
        self._oauth_lock = Lock()

    @staticmethod
    def status() -> dict[str, object]:
        return freesound_status()

    @staticmethod
    def _token() -> str:
        token = (os.getenv("FREESOUND_API_TOKEN") or "").strip()
        if not token:
            raise AudioCatalogSetupError(
                "Add the Freesound API token in Settings before searching.")
        return token

    def _oauth_exchange(self, values: dict[str, str]) -> FreesoundOAuthTokens:
        request = urllib.request.Request(
            f"{self.api_root}/oauth2/access_token/",
            data=urllib.parse.urlencode(values).encode(),
            headers={"Accept": "application/json",
                     "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in {400, 401, 403}:
                raise AudioCatalogSetupError(
                    "Freesound authorization is no longer valid. Reconnect "
                    "Freesound in Settings.") from exc
            raise AudioCatalogError(
                f"Freesound authorization failed ({exc.code}). Try again.") from exc
        except (OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise AudioCatalogError(
                "Freesound authorization could not be completed. Try again.") from exc
        if not isinstance(payload, dict):
            raise AudioCatalogError(
                "Freesound returned an invalid authorization response.")
        access_token = str(payload.get("access_token") or "").strip()
        refresh_token = str(payload.get("refresh_token") or "").strip()
        try:
            expires_in = max(60, int(payload.get("expires_in") or 0))
        except (TypeError, ValueError) as exc:
            raise AudioCatalogError(
                "Freesound returned an invalid authorization lifetime.") from exc
        if not access_token or not refresh_token:
            raise AudioCatalogError(
                "Freesound did not return renewable download access.")
        return FreesoundOAuthTokens(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=int(self.clock()) + expires_in,
        )

    def exchange_authorization_code(
            self, *, client_id: str, client_secret: str,
            authorization_code: str) -> FreesoundOAuthTokens:
        return self._oauth_exchange({
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "authorization_code",
            "code": authorization_code,
        })

    def _refresh_access_token(self) -> str:
        client_id = _environment_value("FREESOUND_CLIENT_ID")
        client_secret = _environment_value("FREESOUND_API_TOKEN")
        refresh_token = _environment_value("FREESOUND_OAUTH_REFRESH_TOKEN")
        if not client_id or not client_secret or not refresh_token:
            raise AudioCatalogSetupError(
                "Reconnect Freesound in Settings before keeping original audio.")
        tokens = self._oauth_exchange({
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        })
        os.environ["FREESOUND_OAUTH_ACCESS_TOKEN"] = tokens.access_token
        os.environ["FREESOUND_OAUTH_REFRESH_TOKEN"] = tokens.refresh_token
        os.environ["FREESOUND_OAUTH_EXPIRES_AT"] = str(tokens.expires_at)
        if self.save_oauth_tokens:
            self.save_oauth_tokens(tokens)
        return tokens.access_token

    def _oauth_token(self, *, force_refresh: bool = False) -> str:
        with self._oauth_lock:
            token = _environment_value("FREESOUND_OAUTH_ACCESS_TOKEN")
            if (not force_refresh and token
                    and _expiry() > int(self.clock()) + 30):
                return token
            refresh_ready = all((_environment_value("FREESOUND_CLIENT_ID"),
                                 _environment_value("FREESOUND_API_TOKEN"),
                                 _environment_value(
                                     "FREESOUND_OAUTH_REFRESH_TOKEN")))
            if refresh_ready:
                return self._refresh_access_token()
            if token and not force_refresh:
                # Compatibility for manually supplied legacy access tokens.
                # A rejected token becomes an explicit reconnect instruction.
                return token
            raise AudioCatalogSetupError(
                "Reconnect Freesound in Settings before keeping original audio.")

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
        token = self._oauth_token()
        request = self._download_request(sound, token)
        try:
            with self.opener(request, timeout=120) as response:
                self._write_download(response, target)
        except urllib.error.HTTPError as exc:
            target.unlink(missing_ok=True)
            if exc.code in {401, 403}:
                try:
                    refreshed = self._oauth_token(force_refresh=True)
                    with self.opener(
                            self._download_request(sound, refreshed),
                            timeout=120) as response:
                        self._write_download(response, target)
                except urllib.error.HTTPError as retry:
                    target.unlink(missing_ok=True)
                    if retry.code in {401, 403}:
                        raise AudioCatalogSetupError(
                            "Freesound authorization is no longer valid. "
                            "Reconnect Freesound in Settings.") from retry
                    raise AudioCatalogError(
                        f"Freesound could not download the original "
                        f"({retry.code}).") from retry
            if exc.code == 404:
                raise AudioCatalogError(
                    "That Freesound source is no longer available.") from exc
            if exc.code not in {401, 403}:
                raise AudioCatalogError(
                    f"Freesound could not download the original "
                    f"({exc.code}).") from exc
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

    def _download_request(self, sound: CatalogSound, token: str):
        return urllib.request.Request(
            f"{self.api_root}/sounds/{sound.external_id}/download/",
            headers={"Authorization": f"Bearer {token}"},
        )

    @staticmethod
    def _write_download(response, target: Path) -> None:
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
