"""Creator Draft service assembly."""

from origins.application.creator_drafts import CreatorDraftService
from origins.infrastructure.postgres.creator_drafts import CreatorDraftRepository


creator_draft_service = CreatorDraftService(CreatorDraftRepository())
