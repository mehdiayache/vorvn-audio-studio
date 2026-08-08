"""Separate durable Job worker process."""

from __future__ import annotations

import signal
import time

import db
from services import voice_package_worker
from audio_studio.application import renders
from audio_studio.application.preferences import load_preferences
from audio_studio.application.text_preparation import (
    TextPreparationJobHandler,
    TextPreparationService,
)

from audio_studio.application.jobs import JobService
from audio_studio.infrastructure.alibaba.text_preparation import AlibabaTextProvider
from audio_studio.infrastructure.legacy_jobs import LegacyProviderJobHandlers
from audio_studio.infrastructure.postgres.text_preparation import (
    PostgresTextPreparationRepository,
)


def main() -> int:
    service = JobService()
    handlers = LegacyProviderJobHandlers()
    service.register("speech", handlers.speech)
    service.register("batch", handlers.batch)
    service.register("transcribe", handlers.transcribe)
    service.register("translate", handlers.translate)
    service.register("rewrite", TextPreparationJobHandler(TextPreparationService(
        PostgresTextPreparationRepository(), AlibabaTextProvider(), load_preferences,
    )))
    service.register("render", renders.handle_job)
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    while not stopping:
        if service.work_once():
            continue
        voice_job_id = db.voice_package_claim_next()
        if voice_job_id:
            voice_package_worker.run(voice_job_id)
            continue
        time.sleep(.5)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
