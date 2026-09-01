"""Separate durable Job worker process."""

from __future__ import annotations

import signal
import time
import os
import threading

from audio_studio import __version__
from audio_studio.application.speech import (
    SpeechGenerationService,
    SpeechJobHandler,
)
from audio_studio.application.preferences import load_preferences
from audio_studio.application.text_preparation import (
    TextPreparationJobHandler,
    TextPreparationService,
)
from audio_studio.application.sound_recipe_normalization import (
    SoundRecipeNormalizationJobHandler,
    SoundRecipeNormalizationService,
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
from audio_studio.application.production_import import ProductionImportJobHandler

from audio_studio.composition.jobs import job_service
from audio_studio.composition.renders import render_service
from audio_studio.composition.audio_generation import audio_generation_service
from audio_studio.composition.creation_files import creation_file_service
from audio_studio.composition.catalog import catalog_service
from audio_studio.composition.timeline import timeline_service
from audio_studio.composition.work import work_service
from audio_studio.providers.alibaba.text_preparation import AlibabaTextProvider
from audio_studio.providers.alibaba.speech_generation import AlibabaSpeechProvider
from audio_studio.providers.alibaba.translation import AlibabaTranslationProvider
from audio_studio.providers.alibaba.transcription import AlibabaTranscriptionProvider
from audio_studio.providers.alibaba.voice_cloning import AlibabaVoiceCloningProvider
from audio_studio.infrastructure.audio_workspace import AudioWorkspace
from audio_studio.providers.enrollment_registry import (
    ExactEnrollmentProviderRegistry,
)
from audio_studio.providers.speech_registry import (
    ExactSpeechProviderRegistry,
)
from audio_studio.infrastructure.postgres.text_preparation import (
    PostgresTextPreparationRepository,
)
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.infrastructure.postgres.voice_packages import VoicePackageRepository
from audio_studio.infrastructure.transcription_source import TranscriptionSourceResolver
from audio_studio.infrastructure.voice_reference_workspace import VoiceReferenceWorkspace
from audio_studio.infrastructure.postgres.worker_runtime import WorkerRuntimeRepository
from audio_studio.application.provider_operations import ProviderOperationService
from audio_studio.infrastructure.postgres.provider_operations import ProviderOperationRepository
from audio_studio.composition.provider_catalogue import provider_catalogue_sync
from audio_studio.composition.director_generation import (
    director_generation_handler,
)
from audio_studio.infrastructure.runtime_environment import (
    reload_owned_environment,
    revision as environment_revision,
)


def main() -> int:
    reload_owned_environment()
    provider_catalogue_sync.refresh()
    runtime_id = (os.getenv("AUDIO_STUDIO_RUNTIME_ID") or "").strip()
    expected_parent_pid = int(os.getenv("AUDIO_STUDIO_PARENT_PID") or 0)
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
        work_service, timeline_service, catalog_service, text_preparation))
    service.register(
        "sound_recipe_normalize",
        SoundRecipeNormalizationJobHandler(SoundRecipeNormalizationService(
            AlibabaTextProvider(), load_preferences, provider_operations,
        )),
    )
    service.register("render", render_service.handle_job)
    service.register("audio_generate", audio_generation_service.handle_job)
    service.register("director_generate", director_generation_handler)
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
        print("Another Auvi Studio worker already owns this queue; exiting.")
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
                    "Auvi Studio worker parent disappeared; "
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
