#!/usr/bin/env python3
"""HTTP-level Phase 1 regressions. No provider call and no user data writes."""

import http.client
import json
import os
import subprocess
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import server


class QuietHandler(server.Handler):
    def log_message(self, _format, *_args):
        pass

    def _check_budget(self, _estimate, _payload):
        return ({"blocked_for_test": True}, 409)


results = []


def check(name, condition, detail=""):
    results.append((name, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" +
          (f" — {detail}" if detail and not condition else ""))


def request(port, method, path, body=None, headers=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    payload = body
    if isinstance(body, dict):
        payload = json.dumps(body).encode()
        headers = {"Content-Type": "application/json", **(headers or {})}
    connection.request(method, path, body=payload, headers=headers or {})
    response = connection.getresponse()
    data = response.read()
    result = response.status, dict(response.getheaders()), data
    connection.close()
    return result


patched = {}


def patch(obj, name, value):
    patched[(obj, name)] = getattr(obj, name)
    setattr(obj, name, value)


with tempfile.TemporaryDirectory() as directory:
    icon_root = Path(directory)
    (icon_root / "brand.png").write_bytes(b"not-a-real-image-but-safe-for-mime-test")
    source_audio = icon_root / "source.wav"
    subprocess_result = subprocess.run([
        "ffmpeg", "-y", "-nostdin", "-loglevel", "error",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2:sample_rate=44100",
        "-ac", "1", "-c:a", "pcm_s16le", str(source_audio),
    ], capture_output=True)
    if subprocess_result.returncode:
        raise RuntimeError(subprocess_result.stderr.decode(errors="replace"))
    original_icon_root = server.ICONS_DIR
    server.ICONS_DIR = icon_root
    provider_calls = []
    original_key = os.environ.get("DASHSCOPE_API_KEY")
    os.environ["DASHSCOPE_API_KEY"] = "test-key-never-sent"

    patch(server, "out_dir", lambda: icon_root)
    patch(server.db, "project_get", lambda project_id: ({"id": project_id, "name": "Fixture"}
                                                         if project_id in {7, 8} else None))
    patch(server.db, "can_hold_recordings", lambda project_id: project_id == 7)
    patch(server.db, "record", lambda _row, **_kwargs: 101)
    patch(server.db, "next_position", lambda _project_id: 0)
    patch(server.db, "asset_allowed", lambda *_args, **_kwargs: False)
    patch(server.db, "project_parts", lambda _project_id: [
        {"id": 1, "kind": "audio", "filename": source_audio.name,
         "title": "Fixture speech", "duration_ms": 200, "missing": False},
        {"id": 2, "kind": "silence", "filename": "", "title": "0.15",
         "duration_ms": 150, "missing": False},
    ])
    patch(server.db, "transcript_for", lambda _generation_id: None)
    patch(server.db, "music_get", lambda _project_id: {})
    patch(server.db, "asset_library_context", lambda _asset_id: {
        "venture_id": 2, "collection": "Music", "asset_id": 55,
    })
    patch(server.db, "asset_get", lambda asset_id: {
        "id": asset_id, "filename": "music.mp3", "legacy_generation_id": 501,
    })
    patch(server.db, "export_record", lambda *_args, **_kwargs: 202)
    patch(server.domain_repo, "create_series", lambda project_id, name, description="": {
        "id": 44, "key": "series:44", "type": "series",
        "parent_key": f"project:{project_id}", "name": name,
        "description": description, "icon": "", "locked": False,
        "metrics": {"parts": 0, "cost": 0},
    })
    patch(server.domain_repo, "project_overview", lambda project_id: {
        "resource": {"id": project_id, "type": "project", "name": "Sleeping guides"},
        "trail": [{"id": 2, "type": "venture", "name": "Heartsnotes"}],
        "series": [{"id": 44, "type": "series", "name": "Fixture Series"}],
        "standalone_productions": [{
            "id": 7, "type": "production", "name": "Standalone",
            "part_count": 2, "duration_ms": 350, "total_cost": 0,
            "series_id": None,
        }],
        "metrics": {"series_count": 1, "standalone_count": 1,
                    "production_count": 2},
    } if project_id == 3 else None)
    patch(server.domain_repo, "update_resource",
          lambda kind, resource_id, changes: {
              "id": resource_id, "type": kind, "name": changes.get("name", "Fixture")
          } if resource_id == 7 else None)

    def fixture_move(production_id, series_id):
        if series_id == 99:
            raise server.domain_repo.DomainConflict(
                "A Production can only join a Series in its own Project.")
        return {"id": production_id, "type": "production", "series_id": series_id}

    def fixture_delete_series(series_id, make_standalone=False):
        if not make_standalone:
            raise server.domain_repo.DomainConflict("This Series still contains Productions.")
        return {"id": series_id, "type": "series", "deleted": True,
                "productions_made_standalone": 2}

    patch(server.domain_repo, "move_production", fixture_move)
    patch(server.domain_repo, "delete_series", fixture_delete_series)
    patch(server.storage, "configured", lambda: True)
    patch(server.alibaba_speech, "synthesize",
          lambda *_args, **_kwargs: provider_calls.append(True))

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        print("media serving")
        status, headers, data = request(port, "GET", "/icon/brand.png")
        check("project images are served as images", status == 200 and
              headers.get("Content-Type") == "image/png", (status, headers))
        status, headers, data = request(
            port, "GET", "/icon/brand.png", headers={"Range": "bytes=0-3"})
        check("media range requests remain seekable", status == 206 and len(data) == 4,
              (status, headers, data))

        print("\nsilence transport")
        status, _, data = request(port, "POST", "/api/project/silence", {
            "project_id": 7, "seconds": 2.5, "insert_at": None,
        })
        payload = json.loads(data)
        check("silence endpoint accepts the corrected contract",
              status == 200 and payload == {"id": 101, "seconds": 2.5},
              (status, payload))

        print("\nfinish endpoint")
        status, _, data = request(port, "POST", "/api/project/stitch", {"id": 7})
        payload = json.loads(data)
        finished = icon_root / payload.get("name", "")
        manifest = icon_root / payload.get("manifest", "")
        check("Finish renders through normalized FFmpeg pipeline",
              status == 200 and finished.exists() and finished.stat().st_size > 0,
              (status, payload))
        check("Finish persists an export manifest",
              manifest.exists() and json.loads(manifest.read_text())["renderer"] ==
              "ffmpeg-normalized-v1", payload)

        print("\nlegacy transcription boundary")
        status, _, data = request(port, "POST", "/api/transcribe", {
            "url": "https://storage.invalid/reference.mp3",
            "name": "reference.mp3", "playable": "/inbox/reference.mp3",
            "size_bytes": 2_500_000,
        })
        payload = json.loads(data)
        check("legacy transcription execution route is removed",
              status == 404 and payload.get("error") == "unknown endpoint",
              (status, payload))

        print("\nlegacy Batch boundary")
        status, _, data = request(port, "POST", "/api/batch/run", {
            "token": "fixture", "columns": {"text": 0},
            "voice": "fixture", "engine": "audio", "model": "plus",
        })
        payload = json.loads(data)
        check("legacy Batch execution route is removed",
              status == 404 and payload.get("error") == "unknown endpoint",
              (status, payload))

        print("\nlegacy Speech boundary")
        status, _, data = request(port, "POST", "/api/speak", {
            "text": "Never send this", "project_id": 999,
        })
        check("legacy Speak execution route is removed", status == 404,
              (status, data))
        status, _, data = request(port, "POST", "/api/part/regenerate", {
            "id": 9, "text": "Never send this",
        })
        check("legacy Take execution route is removed", status == 404,
              (status, data))
        status, _, data = request(port, "POST", "/api/part/render", {
            "id": 9, "text": "Never send this",
        })
        check("legacy Draft render route is removed", status == 404,
              (status, data))
        check("removed Speech routes never reach Alibaba", provider_calls == [])

        print("\nserver-side invariants")

        status, _, data = request(port, "POST", "/api/asset/insert", {
            "project_id": 7, "asset_id": 55,
        })
        check("Music cannot be inserted as a sequential clip", status == 400,
              (status, data))

        status, _, data = request(port, "POST", "/api/project/music", {
            "id": 7, "music_of": 55,
        })
        check("cross-Venture or non-library music is rejected", status == 400,
              (status, data))

        print("\ncanonical hierarchy API")
        status, _, data = request(port, "POST", "/api/v1/projects/3/series", {
            "name": "Fixture Series", "description": "No database write",
        })
        payload = json.loads(data)
        check("Series creation uses the canonical typed endpoint",
              status == 201 and payload.get("data", {}).get("type") == "series"
              and payload["data"].get("parent_key") == "project:3",
              (status, payload))

        status, _, data = request(port, "POST", "/api/v1/projects/3/series", {})
        payload = json.loads(data)
        check("canonical writes reject unnamed resources",
              status == 400 and payload.get("error", {}).get("code") == "name_required",
              (status, payload))

        status, _, data = request(port, "GET", "/api/v1/projects/3/overview")
        payload = json.loads(data)
        overview = payload.get("data", {})
        check("Project overview separates Series from standalone Productions",
              status == 200 and overview.get("series", [{}])[0].get("type") == "series"
              and overview.get("standalone_productions", [{}])[0].get("series_id") is None,
              (status, payload))

        status, _, data = request(port, "PATCH", "/api/v1/productions/7", {
            "name": "Renamed Production",
        })
        payload = json.loads(data)
        check("canonical metadata can be patched with the stable error/data contract",
              status == 200 and payload.get("data", {}).get("name") == "Renamed Production",
              (status, payload))

        status, _, data = request(port, "PATCH", "/api/v1/productions/7/placement", {
            "series_id": None,
        })
        payload = json.loads(data)
        check("Production can be made standalone explicitly",
              status == 200 and payload.get("data", {}).get("series_id") is None,
              (status, payload))

        status, _, data = request(port, "PATCH", "/api/v1/productions/7/placement", {
            "series_id": 99,
        })
        payload = json.loads(data)
        check("cross-Project Series placement is a domain conflict",
              status == 409 and payload.get("error", {}).get("code") == "domain_conflict",
              (status, payload))

        status, _, data = request(port, "DELETE", "/api/v1/series/44")
        payload = json.loads(data)
        check("non-empty Series deletion requires an explicit preservation strategy",
              status == 409 and payload.get("error", {}).get("code") == "series_not_empty",
              (status, payload))

        status, _, data = request(
            port, "DELETE", "/api/v1/series/44?strategy=make_standalone")
        payload = json.loads(data)
        check("Series can be removed while preserving Productions as standalone",
              status == 200
              and payload.get("data", {}).get("productions_made_standalone") == 2,
              (status, payload))

        print("\nrequest limits")
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.putrequest("POST", "/api/project/icon/upload")
        connection.putheader("Content-Length", "4000001")
        connection.endheaders()
        response = connection.getresponse()
        response.read()
        check("oversize upload is rejected before reading its body", response.status == 413,
              response.status)
        connection.close()
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=5)
        server.ICONS_DIR = original_icon_root
        for (obj, name), value in patched.items():
            setattr(obj, name, value)
        if original_key is None:
            os.environ.pop("DASHSCOPE_API_KEY", None)
        else:
            os.environ["DASHSCOPE_API_KEY"] = original_key


failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
raise SystemExit(1 if failed else 0)
