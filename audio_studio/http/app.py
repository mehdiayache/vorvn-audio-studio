"""FastAPI composition root; the only public Audio Studio HTTP process."""

from __future__ import annotations

from contextlib import asynccontextmanager
import mimetypes
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, RedirectResponse

from audio_studio import __version__
from audio_studio.config import settings
from audio_studio.http.middleware import request_context
from audio_studio.http.errors import ApiProblem, problem_handler, validation_handler
from audio_studio.http.routers.system import router as system_router
from audio_studio.http.routers.work import router as work_router
from audio_studio.http.routers.jobs import router as jobs_router
from audio_studio.http.routers.activity import router as activity_router
from audio_studio.http.routers.settings import router as settings_router
from audio_studio.http.routers.subtitles import router as subtitles_router
from audio_studio.http.routers.catalog import router as catalog_router
from audio_studio.http.routers.media import router as media_router
from audio_studio.http.routers.timeline import router as timeline_router
from audio_studio.http.routers.voices import router as voices_router
from audio_studio.http.routers.uploads import router as uploads_router
from audio_studio.http.routers.batches import router as batches_router
from audio_studio.migrations import run as run_migrations


@asynccontextmanager
async def lifespan(_: FastAPI):
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    run_migrations()
    yield


app = FastAPI(title="VORVN Audio Studio API", version=__version__,
              docs_url="/api/docs", redoc_url="/api/redoc",
              openapi_url="/api/v1/openapi.json", lifespan=lifespan)
app.middleware("http")(request_context)
app.add_exception_handler(ApiProblem, problem_handler)
app.add_exception_handler(RequestValidationError, validation_handler)
app.include_router(system_router)
app.include_router(work_router)
app.include_router(jobs_router)
app.include_router(activity_router)
app.include_router(settings_router)
app.include_router(subtitles_router)
app.include_router(catalog_router)
app.include_router(media_router)
app.include_router(timeline_router)
app.include_router(voices_router)
app.include_router(uploads_router)
app.include_router(batches_router)


# The React product has no public dependency on the historical HTTP surface.
# Keep this guard visible until the internal provider adapter is retired too.
COMPATIBILITY_ALLOWLIST: set[str] = set()


def _spa_file(relative: str) -> Path:
    candidate = (settings.web_build / relative).resolve()
    build = settings.web_build.resolve()
    if candidate != build and build not in candidate.parents:
        return build / "index.html"
    return candidate if candidate.is_file() else build / "index.html"


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(f"{settings.web_prefix}/", status_code=307)


@app.api_route("/studio/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def old_studio_redirect(request: Request, path: str) -> RedirectResponse:
    suffix = f"/{path}" if path else "/"
    query = f"?{request.url.query}" if request.url.query else ""
    return RedirectResponse(f"{settings.web_prefix}{suffix}{query}", status_code=308)


@app.api_route("/studio", methods=["GET", "HEAD"], include_in_schema=False)
def old_studio_root_redirect(request: Request) -> RedirectResponse:
    query = f"?{request.url.query}" if request.url.query else ""
    return RedirectResponse(f"{settings.web_prefix}/{query}", status_code=308)


@app.api_route("/audio-studio/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def web(path: str) -> FileResponse:
    return FileResponse(_spa_file(path))


@app.api_route("/audio-studio", methods=["GET", "HEAD"], include_in_schema=False)
def web_root() -> RedirectResponse:
    return RedirectResponse(f"{settings.web_prefix}/", status_code=307)
