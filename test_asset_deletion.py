#!/usr/bin/env python3
"""Pure regression tests for Asset deletion ownership; no files or DB touched."""

from contextlib import contextmanager

import db


class FakeCursor:
    def __init__(self, owned, versions, generations):
        self.owned = owned
        self.versions = versions
        self.generations = generations
        self.current = []
        self.queries = []

    def execute(self, query, params=()):
        normalized = " ".join(query.split())
        self.queries.append((normalized, params))
        if normalized.startswith("SELECT DISTINCT project_id"):
            self.current = []
        elif normalized.startswith("SELECT root.project_id"):
            self.current = []
        elif normalized.startswith("SELECT DISTINCT a.id"):
            self.current = self.owned
        elif normalized.startswith("SELECT filename FROM asset_versions"):
            self.current = self.versions
        elif normalized.startswith("SELECT filename FROM generations"):
            self.current = self.generations

    def fetchall(self):
        return self.current

    def fetchone(self):
        return self.current[0] if self.current else None


def run_case(owned, versions, generations):
    fake = FakeCursor(owned, versions, generations)
    original = db.cursor

    @contextmanager
    def fake_context(write=False):
        yield fake

    db.cursor = fake_context
    try:
        files = db.parts_delete([101])
    finally:
        db.cursor = original
    return files, [query for query, _ in fake.queries]


owned_files, owned_queries = run_case(
    owned=[(7,)], versions=[("library.mp3",)], generations=[("library.mp3",)])
assert owned_files == ["library.mp3"]
assert any(query.startswith("DELETE FROM assets") for query in owned_queries)
assert owned_queries.index(next(q for q in owned_queries if q.startswith("DELETE FROM assets"))) < \
       owned_queries.index(next(q for q in owned_queries if q.startswith("DELETE FROM generations")))

linked_files, linked_queries = run_case(owned=[], versions=[], generations=[])
assert linked_files == []
assert not any(query.startswith("DELETE FROM assets") for query in linked_queries)
assert any(query.startswith("DELETE FROM generations") for query in linked_queries)

print("Asset deletion ownership verified: source Assets and Production links stay distinct")
