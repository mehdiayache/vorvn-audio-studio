"""Composer Draft service assembly."""

from origins.application.composer_drafts import ComposerDraftService
from origins.infrastructure.postgres.composer_drafts import ComposerDraftRepository


composer_draft_service = ComposerDraftService(ComposerDraftRepository())
