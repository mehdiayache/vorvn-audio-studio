"""Private S3-compatible object storage owned by Auvi Studio.

Keys contain durable application IDs, never display names. Provider access is
granted with a short-lived presigned URL; durable and temporary objects are
tagged so bucket lifecycle rules can treat them independently.
"""

from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
import re
from uuid import uuid4


LINK_TTL_SECONDS = 900
_SEGMENT = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$")


def settings() -> dict[str, str]:
    return {
        "endpoint": (os.getenv("RUSTFS_ENDPOINT") or "").rstrip("/"),
        "access_key": os.getenv("RUSTFS_ACCESS_KEY") or "",
        "secret_key": os.getenv("RUSTFS_SECRET_KEY") or "",
        "bucket": os.getenv("RUSTFS_BUCKET") or "",
        "prefix": (os.getenv("RUSTFS_PREFIX") or "text-to-voice").strip("/"),
        "region": os.getenv("RUSTFS_REGION") or "us-east-1",
        "organization_id": (os.getenv("AUDIO_STUDIO_ORGANIZATION_ID")
                            or "local-studio").strip(),
    }


def configured() -> bool:
    values = settings()
    return all(values[key] for key in ("endpoint", "access_key", "secret_key", "bucket"))


def _client(*, quick: bool = False):
    import boto3
    from botocore.config import Config
    values = settings()
    timeouts = ({"connect_timeout": 4, "read_timeout": 6,
                 "retries": {"max_attempts": 1}} if quick else
                {"connect_timeout": 15, "read_timeout": 120})
    return boto3.client(
        "s3", endpoint_url=values["endpoint"],
        aws_access_key_id=values["access_key"],
        aws_secret_access_key=values["secret_key"],
        region_name=values["region"],
        config=Config(signature_version="s3v4",
                      s3={"addressing_style": "path"}, **timeouts),
    )


def _explain(exc: Exception) -> str:
    message = str(exc); lowered = message.lower(); values = settings()
    if "404" in message or "nosuchbucket" in lowered:
        return f"Bucket '{values['bucket']}' doesn't exist on that server."
    if "403" in message or "accessdenied" in lowered or "signature" in lowered:
        return "The server rejected those keys — check the access key and secret."
    if "endpoint" in lowered or "connect" in lowered or "resolve" in lowered:
        return f"Couldn't reach {values['endpoint']} — check the address."
    return message[:160]


def status() -> dict:
    if not configured():
        return {"configured": False, "reason": "Not set up yet."}
    try:
        client = _client(quick=True)
        client.head_bucket(Bucket=settings()["bucket"])
        values = settings()
        return {"configured": True, "bucket": values["bucket"],
                "endpoint": values["endpoint"], "prefix": values["prefix"]}
    except Exception as exc:
        return {"configured": False, "reason": _explain(exc)}


def object_key(*, kind: str, object_id: str, extension: str,
               variant: str = "source") -> str:
    values = settings(); organization = values["organization_id"]
    if not _SEGMENT.fullmatch(organization):
        raise ValueError("AUDIO_STUDIO_ORGANIZATION_ID is invalid.")
    if (not _SEGMENT.fullmatch(kind) or not _SEGMENT.fullmatch(object_id)
            or not _SEGMENT.fullmatch(variant)):
        raise ValueError("The storage object identity is invalid.")
    suffix = extension.casefold().lstrip(".")
    if not re.fullmatch(r"[a-z0-9]{1,10}", suffix):
        raise ValueError("The storage object extension is invalid.")
    return (f"{values['prefix']}/v1/organizations/{organization}/"
            f"objects/{kind}/{object_id}/{variant}.{suffix}")


def put(local_path: str | Path, content_type: str = "audio/wav",
        kind: str = "voice-clone", *, object_id: str | None = None,
        retention: str = "temporary", variant: str = "source") -> dict:
    """Persist an object and return its durable locator, never a signed URL."""
    if not configured():
        raise RuntimeError("Object storage isn't set up. Add its details in Settings.")
    if retention not in {"temporary", "durable"}:
        raise ValueError("The storage retention class is invalid.")
    values = settings(); target = Path(local_path)
    identity = object_id or f"obj_{uuid4().hex}"
    key = object_key(kind=kind, object_id=identity,
                     extension=target.suffix or ".bin", variant=variant)
    with target.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").digest()
    with target.open("rb") as source:
        _client().put_object(
            Bucket=values["bucket"], Key=key, Body=source,
            ContentType=content_type,
            ChecksumSHA256=base64.b64encode(digest).decode("ascii"),
            Metadata={"audio-studio-object-id": identity,
                      "retention": retention,
                      "variant": variant},
            Tagging=f"retention={retention}",
        )
    return {"backend": "s3", "bucket": values["bucket"], "key": key,
            "sha256": digest.hex(), "size_bytes": target.stat().st_size}


def signed_url(*, bucket: str, key: str,
               expires_in: int = LINK_TTL_SECONDS) -> str:
    if not configured():
        raise RuntimeError("Object storage isn't set up. Add its details in Settings.")
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in)


def download(*, bucket: str, key: str, target: str | Path) -> Path:
    """Restore a private durable object into an application-owned cache."""
    destination = Path(target)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".partial")
    try:
        _client().download_file(bucket, key, str(temporary))
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def upload(local_path: str | Path, content_type: str = "audio/wav",
           kind: str = "voice-clone", *, object_id: str | None = None,
           retention: str = "temporary") -> str:
    locator = put(local_path, content_type=content_type, kind=kind,
                  object_id=object_id, retention=retention)
    return signed_url(bucket=locator["bucket"], key=locator["key"])
