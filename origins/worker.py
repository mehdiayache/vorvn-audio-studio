"""Separate durable Job worker process."""

from __future__ import annotations

import signal
import time
import os
import threading

from origins import __version__
from origins.application.speech import (
    SpeechGenerationService,
    SpeechJobHandler,
)
from origins.application.preferences import load_preferences
from origins.application.text_preparation import (
    TextPreparationJobHandler,
    TextPreparationService,
)
from origins.application.sound_preset_normalization import (
    SoundPresetNormalizationJobHandler,
    SoundPresetNormalizationService,
)
from origins.application.translation import (
    SubtitleTranslationJobHandler,
    SubtitleTranslationService,
    Translator,
)
from origins.application.transcription import (
    TranscriptionJobHandler,
    TranscriptionService,
)
from origins.application.voice_cloning import VoiceCloningService
from origins.application.production_import import ProductionImportJobHandler

from origins.composition.jobs import job_service
from origins.composition.renders import render_service
from origins.composition.audio_generation import audio_generation_service
from origins.composition.creation_files import creation_file_service
from origins.composition.catalog import catalog_service
from origins.composition.timeline import timeline_service
from origins.composition.productions import production_service
from origins.providers.alibaba.text_preparation import AlibabaTextProvider
from origins.providers.alibaba.speech_generation import AlibabaSpeechProvider
from origins.providers.alibaba.translation import AlibabaTranslationProvider
from origins.providers.alibaba.transcription import AlibabaTranscriptionProvider
from origins.providers.alibaba.voice_cloning import AlibabaVoiceCloningProvider
from origins.infrastructure.audio_workspace import AudioWorkspace
from origins.providers.enrollment_registry import (
    ExactEnrollmentProviderRegistry,
)
from origins.providers.speech_registry import (
    ExactSpeechProviderRegistry,
)
from origins.infrastructure.postgres.text_preparation import (
    PostgresTextPreparationRepository,
)
from origins.infrastructure.postgres.transcripts import TranscriptRepository
from origins.infrastructure.postgres.speech import SpeechRepository
from origins.infrastructure.postgres.voice_packages import VoicePackageRepository
from origins.infrastructure.transcription_source import TranscriptionSourceResolver
from origins.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace
from origins.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository
from origins.application.provider_operations import ProviderOperationService
from origins.infrastructure.postgres.provider_operations import ProviderOperationRepository
from origins.composition.provider_catalogue import provider_catalogue_sync
from origins.composition.media_generation import (
    media_generation_handler,
)
from origins.infrastructure.runtime_environment import (
    reload_owned_environment,
    revision as environment_revision,
)


def main() -> int:
    reload_owned_environment()
    provider_catalogue_sync.refresh()
    runtime_id = (os.getenv("ORIGINS_RUNTIME_ID") or "").strip()
    expected_parent_pid = int(os.getenv("ORIGINS_PARENT_PID") or 0)
    service = job_service
    speech = SpeechRepository()
    alibaba_speech = AlibabaSpeechProvider()
    speech_provider = ExactSpeechProviderRegistry({
        ("alibaba", adapter_key): alibaba_speech
        for adapter_key in ("audio", "qwen_tts", "cosyvoice")
    })
    provider_operations = ProviderOperationService(ProviderOperationRepository())
    service.register("speech", SpeechJobHandler(
        SpeechGenerationService(
            speech, speech_provider, AudioWorkspace(), load_preferences,
            provider_operations,
        ),
        creation_file_service,
    ))
    transcripts = TranscriptRepository()
    service.register("transcribe", TranscriptionJobHandler(
        TranscriptionService(
            transcripts,
            AlibabaTranscriptionProvider(),
            TranscriptionSourceResolver(transcripts),
            load_preferences, provider_operations,
        ),
        creation_file_service,
    ))
    service.register("translate", SubtitleTranslationJobHandler(
        SubtitleTranslationService(
            transcripts,
            Translator(AlibabaTranslationProvider()),
            load_preferences, provider_operations,
        ),
        creation_file_service,
    ))
    text_preparation = TextPreparationService(
        PostgresTextPreparationRepository(), AlibabaTextProvider(),
        load_preferences, provider_operations)
    service.register("rewrite", TextPreparationJobHandler(text_preparation))
    service.register("production_import", ProductionImportJobHandler(
        production_service, timeline_service, catalog_service, text_preparation))
    service.register(
        "sound_preset_normalize",
        SoundPresetNormalizationJobHandler(SoundPresetNormalizationService(
            AlibabaTextProvider(), load_preferences, provider_operations,
        )),
    )
    service.register("render", render_service.handle_job)
    service.register("audio_generate", audio_generation_service.handle_job)
    service.register("media_generate", media_generation_handler)
    alibaba_enrollment = AlibabaVoiceCloningProvider()
    enrollment_provider = ExactEnrollmentProviderRegistry({
        ("alibaba", adapter_key): alibaba_enrollment
        for adapter_key in ("audio", "qwen_tts", "cosyvoice")
    })
    voice_cloning = VoiceCloningService(
        VoicePackageRepository(), enrollment_provider,
        VoiceReferenceWorkspace(), provider_operations, load_preferences,
    )
    stopping = False
    runtime = WorkerRuntimeRepository()
    if not runtime.acquire():
        print("Another Origins worker already owns this queue; exiting.")
        return 75
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
                runtime.heartbeat(detail={
                    "pid": os.getpid(),
                    "parent_pid": expected_parent_pid or os.getppid(),
                    "runtime_id": runtime_id,
                    "version": __version__,
                })
            except Exception:
                pass
            lease_stop.wait(2)

    lease_thread = threading.Thread(
        target=pulse_worker, daemon=True, name="worker-readiness-heartbeat")
    lease_thread.start()
    try:
        while not stopping:
            if expected_parent_pid and os.getppid() != expected_parent_pid:
                print(
                    "Origins worker parent disappeared; "
                    "releasing the queue.")
                break
            now = time.monotonic()
            current_revision = environment_revision()
            if current_revision != loaded_revision:
                reload_owned_environment()
                loaded_revision = current_revision
            if now - last_maintenance >= 30:
                service.abandon_stale()
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
