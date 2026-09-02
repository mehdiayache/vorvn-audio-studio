"""Small Workspace-owned reference sets for Creator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


SavedReferenceType = Literal[
    "character", "object", "place", "style", "other",
]
SAVED_REFERENCE_TYPES = {
    "character", "object", "place", "style", "other",
}


@dataclass(frozen=True, slots=True)
class SavedReferenceDraft:
    name: str
    reference_type: SavedReferenceType
    file_ids: tuple[int, ...]

    @classmethod
    def create(
        cls, name: str, reference_type: str, file_ids: list[int],
    ) -> "SavedReferenceDraft":
        clean_name = name.strip()
        if not clean_name or len(clean_name) > 120:
            raise ValueError("Reference name must contain 1 to 120 characters.")
        if reference_type not in SAVED_REFERENCE_TYPES:
            raise ValueError("Choose a supported reference type.")
        ordered = tuple(dict.fromkeys(file_ids))
        if not ordered:
            raise ValueError("Choose at least one media item for this reference.")
        if len(ordered) > 12:
            raise ValueError("A saved reference can contain at most 12 media items.")
        if any(file_id <= 0 for file_id in ordered):
            raise ValueError("Reference media must use valid IDs.")
        return cls(clean_name, reference_type, ordered)  # type: ignore[arg-type]
