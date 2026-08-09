#!/usr/bin/env python3
"""
Object storage for voice-clone reference audio (RustFS, MinIO, S3 — anything
S3-compatible).

Alibaba's cloning service fetches the reference recording over HTTP, so the
audio has to live somewhere publicly reachable. Rather than a public bucket, we
upload privately and hand out a **presigned link** that expires shortly after —
long enough for Alibaba to fetch it, short enough that it isn't a standing
exposure of someone's voice.

Credentials come from .env:
    RUSTFS_ENDPOINT   https://storage.example.com
    RUSTFS_ACCESS_KEY …
    RUSTFS_SECRET_KEY …
    RUSTFS_BUCKET     vorvn-audio-studio
    RUSTFS_PREFIX     text-to-voice      (optional folder inside the bucket, so
                                          one bucket can serve several projects)
    RUSTFS_REGION     us-east-1          (optional; most S3 clones ignore it)
    RUSTFS_PUBLIC_URL https://cdn.example.com  (optional; use instead of a
                                                presigned link when the bucket
                                                is already world-readable)
"""

import base64
import hashlib
import os
from pathlib import Path
import re
from uuid import uuid4

# Alibaba only needs to fetch the file once, right after we hand over the link.
LINK_TTL_SECONDS = 900


def settings() -> dict:
    return {
        "endpoint": (os.getenv("RUSTFS_ENDPOINT") or "").rstrip("/"),
        "access_key": os.getenv("RUSTFS_ACCESS_KEY") or "",
        "secret_key": os.getenv("RUSTFS_SECRET_KEY") or "",
        "bucket": os.getenv("RUSTFS_BUCKET") or "",
        # Everything this app writes lives under one folder, so the bucket can
        # be shared with other projects without them tangling.
        "prefix": (os.getenv("RUSTFS_PREFIX") or "text-to-voice").strip("/"),
        "region": os.getenv("RUSTFS_REGION") or "us-east-1",
        "public_url": (os.getenv("RUSTFS_PUBLIC_URL") or "").rstrip("/"),
        "organization_id": (os.getenv("AUDIO_STUDIO_ORGANIZATION_ID")
                            or "local-studio").strip(),
    }


def configured() -> bool:
    s = settings()
    return all([s["endpoint"], s["access_key"], s["secret_key"], s["bucket"]])


def _client(quick: bool = False):
    import boto3
    from botocore.config import Config
    s = settings()
    # A mistyped address must fail in seconds, not sit on boto3's 60s default
    # while the user stares at "Testing…".
    timeouts = ({"connect_timeout": 4, "read_timeout": 6,
                 "retries": {"max_attempts": 1}} if quick else
                {"connect_timeout": 15, "read_timeout": 120})
    return boto3.client(
        "s3",
        endpoint_url=s["endpoint"],
        aws_access_key_id=s["access_key"],
        aws_secret_access_key=s["secret_key"],
        region_name=s["region"],
        # Path style keeps working when the endpoint is a bare IP or a host
        # without wildcard DNS, which self-hosted storage usually is.
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      **timeouts),
    )


def status() -> dict:
    """Report whether storage is usable, with a reason when it isn't."""
    if not configured():
        return {"configured": False, "reason": "Not set up yet."}
    try:
        client = _client(quick=True)
        client.head_bucket(Bucket=settings()["bucket"])
        return {"configured": True, "bucket": settings()["bucket"],
                "endpoint": settings()["endpoint"]}
    except Exception as exc:
        return {"configured": False, "reason": _explain(exc)}


def _explain(exc: Exception) -> str:
    text = str(exc)
    lowered = text.lower()
    if "404" in text or "nosuchbucket" in lowered:
        return f"Bucket '{settings()['bucket']}' doesn't exist on that server."
    if "403" in text or "accessdenied" in lowered or "signature" in lowered:
        return "The server rejected those keys — check the access key and secret."
    if "endpoint" in lowered or "connect" in lowered or "resolve" in lowered:
        return f"Couldn't reach {settings()['endpoint']} — check the address."
    return text[:160]


_SEGMENT = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$")


def object_key(*, kind: str, object_id: str, extension: str) -> str:
    """Build a stable, tenant-scoped S3 key without user-controlled names."""
    s = settings()
    organization = s["organization_id"]
    if not _SEGMENT.fullmatch(organization):
        raise ValueError("AUDIO_STUDIO_ORGANIZATION_ID is invalid.")
    if not _SEGMENT.fullmatch(kind) or not _SEGMENT.fullmatch(object_id):
        raise ValueError("The storage object identity is invalid.")
    suffix = extension.casefold().lstrip(".")
    if not re.fullmatch(r"[a-z0-9]{1,10}", suffix):
        raise ValueError("The storage object extension is invalid.")
    return (f"{s['prefix']}/v1/organizations/{organization}/"
            f"objects/{kind}/{object_id}/source.{suffix}")


def upload(local_path, content_type: str = "audio/wav",
           kind: str = "voice-clone", *, object_id: str | None = None,
           retention: str = "temporary") -> str:
    """Store the file and return a URL Alibaba can fetch.

    `kind` groups uploads by purpose (voice-clone, transcribe) so the bucket
    stays browsable instead of becoming one flat pile.
    """
    s = settings()
    if not configured():
        raise RuntimeError(
            "Object storage isn't set up. Add your RustFS details in Settings, "
            "or paste a public link to the audio instead."
        )
    target = Path(local_path)
    identity = object_id or f"obj_{uuid4().hex}"
    key = object_key(kind=kind, object_id=identity,
                     extension=target.suffix or ".bin")
    if retention not in {"temporary", "durable"}:
        raise ValueError("The storage retention class is invalid.")
    client = _client()
    digest = hashlib.sha256(target.read_bytes()).digest()
    with target.open("rb") as handle:
        client.put_object(
            Bucket=s["bucket"], Key=key, Body=handle,
            ContentType=content_type,
            ChecksumSHA256=base64.b64encode(digest).decode("ascii"),
            Metadata={"audio-studio-object-id": identity,
                      "retention": retention},
            Tagging=f"retention={retention}",
        )

    # A world-readable bucket can serve the object directly; otherwise sign it.
    if s["public_url"]:
        return f"{s['public_url']}/{key}"
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": s["bucket"], "Key": key},
        ExpiresIn=LINK_TTL_SECONDS,
    )
