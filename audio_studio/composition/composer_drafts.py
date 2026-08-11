"""Composer Draft service assembly."""

from audio_studio.application.composer_drafts import ComposerDraftService
from audio_studio.infrastructure.postgres.composer_drafts import ComposerDraftRepository


composer_draft_service = ComposerDraftService(ComposerDraftRepository())

