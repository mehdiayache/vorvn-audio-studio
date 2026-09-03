"""Canonical invariants for the active Production Part sequence."""

from __future__ import annotations


def release_archived_positions(cursor, production_id: int) -> None:
    """Keep archive provenance without letting it occupy an active slot.

    This is deliberately safe to run before every insertion.  It repairs data
    written by an older runtime as well as enforcing the current invariant.
    """
    cursor.execute("""
        UPDATE production_parts
           SET archived_position=coalesce(archived_position, position),
               position=NULL, updated_at=now()
         WHERE production_id=%s AND archived_at IS NOT NULL
           AND position IS NOT NULL
    """, (production_id,))
