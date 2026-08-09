"""Shrink-only dependency boundaries for the architecture migration.

The allowlists record existing debt, not permitted architecture. A migration
must remove its edge from the matching allowlist in the same commit. New edges
are rejected automatically.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).parent
PACKAGE = ROOT / "audio_studio"


def _module_name(path: Path) -> str:
    relative = path.relative_to(ROOT).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _imports(path: Path) -> set[str]:
    imported: set[str] = set()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.update(f"{node.module}.{alias.name}" for alias in node.names)
    return imported


def _edges(paths: list[Path], prefixes: tuple[str, ...]) -> set[str]:
    return {
        f"{_module_name(path)} -> {imported}"
        for path in paths
        for imported in _imports(path)
        if imported.startswith(prefixes)
    }


APPLICATION_INFRASTRUCTURE_DEBT: set[str] = set()

APPLICATION_TECHNICAL_DEBT: set[str] = set()

HTTP_INFRASTRUCTURE_DEBT = {
    "audio_studio.http.routers.batches -> audio_studio.infrastructure.batch_workspace.FilesystemBatchWorkspace",
    "audio_studio.http.routers.batches -> audio_studio.infrastructure.postgres.speech.SpeechRepository",
    "audio_studio.http.routers.subtitles -> audio_studio.infrastructure.media_paths.media_root",
    "audio_studio.http.routers.subtitles -> audio_studio.infrastructure.postgres.transcripts.TranscriptRepository",
}

INFRASTRUCTURE_APPLICATION_DEBT = {
    "audio_studio.infrastructure.alibaba.text_preparation -> audio_studio.application.text_preparation.Completion",
    "audio_studio.infrastructure.alibaba.transcription -> audio_studio.application.transcription.FUN_MODEL",
    "audio_studio.infrastructure.alibaba.transcription -> audio_studio.application.transcription.ProviderTranscript",
    "audio_studio.infrastructure.alibaba.transcription -> audio_studio.application.transcription.QWEN_MODEL",
    "audio_studio.infrastructure.alibaba.translation -> audio_studio.application.translation.ProviderTranslation",
    "audio_studio.infrastructure.postgres.jobs -> audio_studio.application.transcription.FUN_MODEL",
    "audio_studio.infrastructure.postgres.jobs -> audio_studio.application.transcription.QWEN_MODEL",
    "audio_studio.infrastructure.transcription_source -> audio_studio.application.transcription.PreparedAudio",
}

TRANSITIONAL_MODULE_DEBT: set[str] = set()

ROOT_MODULE_DEBT: set[str] = set()

SERVICES_MODULE_DEBT: set[str] = set()


class ArchitectureBoundaryTests(unittest.TestCase):
    def test_domain_is_technically_pure(self):
        paths = list((PACKAGE / "domain").rglob("*.py"))
        forbidden = (
            "fastapi", "psycopg", "audio_studio.application",
            "audio_studio.http", "audio_studio.infrastructure", "services",
            "say", "batch", "transcribe", "translate", "naming",
            "rewrite", "streaming", "vocabulary", "importer",
        )
        self.assertEqual(_edges(paths, forbidden), set())

    def test_application_infrastructure_debt_can_only_shrink(self):
        paths = list((PACKAGE / "application").rglob("*.py"))
        actual = _edges(paths, ("audio_studio.infrastructure",))
        self.assertEqual(actual, APPLICATION_INFRASTRUCTURE_DEBT)

    def test_application_technical_debt_can_only_shrink(self):
        paths = list((PACKAGE / "application").rglob("*.py"))
        actual = _edges(paths, ("fastapi", "psycopg", "boto3"))
        self.assertEqual(actual, APPLICATION_TECHNICAL_DEBT)

    def test_http_infrastructure_debt_can_only_shrink(self):
        paths = list((PACKAGE / "http").rglob("*.py"))
        actual = _edges(paths, ("audio_studio.infrastructure",))
        self.assertEqual(actual, HTTP_INFRASTRUCTURE_DEBT)

    def test_reverse_infrastructure_dependency_can_only_shrink(self):
        paths = list((PACKAGE / "infrastructure").rglob("*.py"))
        actual = _edges(paths, ("audio_studio.application",))
        self.assertEqual(actual, INFRASTRUCTURE_APPLICATION_DEBT)

    def test_transitional_module_dependencies_can_only_shrink(self):
        transitional = (
            "services", "say", "batch", "transcribe", "translate", "naming",
            "rewrite", "streaming", "vocabulary", "importer",
        )
        paths = list(PACKAGE.rglob("*.py"))
        actual = _edges(paths, transitional)
        self.assertEqual(actual, TRANSITIONAL_MODULE_DEBT)

    def test_root_business_module_inventory_can_only_shrink(self):
        actual = {
            path.name for path in ROOT.glob("*.py")
            if not path.name.startswith("test_")
        }
        self.assertEqual(actual, ROOT_MODULE_DEBT)

    def test_services_module_inventory_can_only_shrink(self):
        actual = {
            path.relative_to(ROOT).as_posix()
            for path in (ROOT / "services").rglob("*.py")
        }
        self.assertEqual(actual, SERVICES_MODULE_DEBT)


if __name__ == "__main__":
    unittest.main()
