"""Shrink-only dependency boundaries for the architecture migration.

The allowlists record existing debt, not permitted architecture. A migration
must remove its edge from the matching allowlist in the same commit. New edges
are rejected automatically.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "origins"


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

HTTP_INFRASTRUCTURE_DEBT: set[str] = set()

INFRASTRUCTURE_APPLICATION_DEBT: set[str] = set()

TRANSITIONAL_MODULE_DEBT: set[str] = set()

ROOT_MODULE_DEBT: set[str] = set()

SERVICES_MODULE_DEBT: set[str] = set()


class ArchitectureBoundaryTests(unittest.TestCase):
    def test_domain_is_technically_pure(self):
        paths = list((PACKAGE / "domain").rglob("*.py"))
        forbidden = (
            "fastapi", "psycopg", "origins.application",
            "origins.http", "origins.infrastructure", "services",
            "say", "batch", "transcribe", "translate", "naming",
            "rewrite", "streaming", "vocabulary", "importer",
        )
        self.assertEqual(_edges(paths, forbidden), set())

    def test_application_infrastructure_debt_can_only_shrink(self):
        paths = list((PACKAGE / "application").rglob("*.py"))
        actual = _edges(paths, ("origins.infrastructure",))
        self.assertEqual(actual, APPLICATION_INFRASTRUCTURE_DEBT)

    def test_application_technical_debt_can_only_shrink(self):
        paths = list((PACKAGE / "application").rglob("*.py"))
        actual = _edges(paths, ("fastapi", "psycopg", "boto3"))
        self.assertEqual(actual, APPLICATION_TECHNICAL_DEBT)

    def test_http_infrastructure_debt_can_only_shrink(self):
        paths = list((PACKAGE / "http").rglob("*.py"))
        actual = _edges(paths, ("origins.infrastructure",))
        self.assertEqual(actual, HTTP_INFRASTRUCTURE_DEBT)

    def test_reverse_infrastructure_dependency_can_only_shrink(self):
        paths = list((PACKAGE / "infrastructure").rglob("*.py"))
        actual = _edges(paths, ("origins.application",))
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
