"""Separate durable Job worker process."""

from __future__ import annotations

import signal
import time
import os
import threading

from audio_studio.application import renders
from audio_studio.application.batches import (
    BatchGenerationService,
    BatchJobHandler,
)
from audio_studio.application.speech import (
    SpeechGenerationService,
    SpeechJobHandler,
)
from audio_studio.application.preferences import load_preferences
from audio_studio.application.text_preparation import (
    TextPreparationJobHandler,
    TextPreparationService,
)
from audio_studio.application.translation import (
    SubtitleTranslationJobHandler,
    SubtitleTranslationService,
    Translator,
)
from audio_studio.application.transcription import (
    TranscriptionJobHandler,
    TranscriptionService,
)
from audio_studio.application.voice_cloning import VoiceCloningService

from audio_studio.application.jobs import JobService
from audio_studio.infrastructure.alibaba.text_preparation import AlibabaTextProvider
from audio_studio.infrastructure.alibaba.speech_generation import AlibabaSpeechProvider
from audio_studio.infrastructure.alibaba.translation import AlibabaTranslationProvider
from audio_studio.infrastructure.alibaba.transcription import AlibabaTranscriptionProvider
from audio_studio.infrastructure.alibaba.voice_cloning import AlibabaVoiceCloningProvider
from audio_studio.infrastructure.audio_workspace import AudioWorkspace
from audio_studio.infrastructure.batch_workspace import FilesystemBatchWorkspace
from audio_studio.infrastructure.postgres.text_preparation import (
    PostgresTextPreparationRepository,
)
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.transcription_source import TranscriptionSourceResolver
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace
from audio_studio.infrastructure.postgres.jobs import JobRepository
from audio_studio.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository
from audio_studio.infrastructure.runtime_environment import (
    reload_owned_environment,
    revision as environment_revision,
)


def main() -> int:
    reload_owned_environment()
    service = JobService()
    speech = SpeechRepository()
    speech_provider = AlibabaSpeechProvider()
    service.register("speech", SpeechJobHandler(SpeechGenerationService(
        speech, speech_provider, AudioWorkspace(), load_preferences,
    )))
    service.register("batch", BatchJobHandler(BatchGenerationService(
        FilesystemBatchWorkspace(), speech, speech_provider,
        load_preferences,
    )))
    transcripts = TranscriptRepository()
    service.register("transcribe", TranscriptionJobHandler(
        TranscriptionService(
            transcripts,
            AlibabaTranscriptionProvider(),
            TranscriptionSourceResolver(transcripts),
            load_preferences,
        )
    ))
    service.register("translate", SubtitleTranslationJobHandler(
        SubtitleTranslationService(
            transcripts,
            Translator(AlibabaTranslationProvider()),
            load_preferences,
        )
    ))
    service.register("rewrite", TextPreparationJobHandler(TextPreparationService(
        PostgresTextPreparationRepository(), AlibabaTextProvider(), load_preferences,
    )))
    service.register("render", renders.handle_job)
    voice_cloning = VoiceCloningService(
        VoicePackageRepository(), AlibabaVoiceCloningProvider(),
        VoiceReferenceWorkspace(),
    )
    stopping = False
    runtime = WorkerRuntimeRepository()
    jobs = JobRepository()
    last_maintenance = 0.0
    loaded_revision = environment_revision()

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    lease_stop = threading.Event()

    def pulse_worker() -> None:
        while not lease_stop.is_set():
            try:
                runtime.heartbeat(detail={"pid": os.getpid()})
            except Exception:
                pass
            lease_stop.wait(2)

    lease_thread = threading.Thread(
        target=pulse_worker, daemon=True, name="worker-readiness-heartbeat")
    lease_thread.start()
    try:
        while not stopping:
            now = time.monotonic()
            current_revision = environment_revision()
            if current_revision != loaded_revision:
                reload_owned_environment()
                loaded_revision = current_revision
            if now - last_maintenance >= 30:
                jobs.abandon_stale()
                last_maintenance = now
            if service.work_once():
                continue
            if voice_cloning.work_once():
                continue
            time.sleep(.25)
    finally:
        lease_stop.set()
        lease_thread.join(timeout=3)
        runtime.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
