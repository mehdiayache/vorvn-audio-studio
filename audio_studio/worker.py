"""Separate durable Job worker process."""

from __future__ import annotations

import signal
import time

import db
from services import voice_package_worker
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

from audio_studio.application.jobs import JobService
from audio_studio.infrastructure.alibaba.text_preparation import AlibabaTextProvider
from audio_studio.infrastructure.alibaba.speech_generation import AlibabaSpeechProvider
from audio_studio.infrastructure.alibaba.translation import AlibabaTranslationProvider
from audio_studio.infrastructure.alibaba.transcription import AlibabaTranscriptionProvider
from audio_studio.infrastructure.audio_workspace import AudioWorkspace
from audio_studio.infrastructure.batch_workspace import FilesystemBatchWorkspace
from audio_studio.infrastructure.postgres.text_preparation import (
    PostgresTextPreparationRepository,
)
from audio_studio.infrastructure.postgres.transcripts import TranscriptRepository
from audio_studio.infrastructure.postgres.speech import SpeechRepository
from audio_studio.infrastructure.transcription_source import TranscriptionSourceResolver


def main() -> int:
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
