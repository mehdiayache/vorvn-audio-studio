"""OpenAPI contracts for the saved Subtitle catalogue."""

import unittest

from origins.http.app import app
from origins.http.file_contracts import WorkspaceFileResponse


class ContentContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = app.openapi()

    def response_schema(self, path: str, method: str) -> dict:
        return self.schema["paths"][path][method]["responses"]["200"][
            "content"]["application/json"]["schema"]

    def test_operations_reference_explicit_envelopes(self):
        expected = {
            ("/api/v1/subtitles", "get"): "SubtitleListEnvelope",
            ("/api/v1/subtitles/{transcript_id}", "get"): "SubtitleEnvelope",
            ("/api/v1/subtitles/{transcript_id}", "delete"):
                "SubtitleDeletedEnvelope",
            ("/api/v1/subtitles/{transcript_id}/layouts/{profile}", "get"):
                "CaptionLayoutEnvelope",
        }
        for operation, component in expected.items():
            with self.subTest(operation=operation):
                self.assertEqual(
                    self.response_schema(*operation),
                    {"$ref": f"#/components/schemas/{component}"},
                )

    def test_generated_shapes_expose_nested_runtime_fields(self):
        components = self.schema["components"]["schemas"]
        self.assertIn("sentences", components["SubtitleResponse"]["required"])
        self.assertIn("timing_quality",
                      components["CaptionLayoutResponse"]["required"])
        profile = components["CaptionProfileResponse"]["properties"]["key"]
        self.assertEqual(profile["enum"], ["standard", "short", "words"])

    def test_every_successful_json_response_has_an_explicit_contract(self):
        """Prevent new endpoints from silently degrading to unknown objects."""
        for path, path_item in self.schema["paths"].items():
            for method, operation in path_item.items():
                if method not in {"get", "post", "patch", "put", "delete"}:
                    continue
                for status, response in operation.get("responses", {}).items():
                    if not status.startswith("2"):
                        continue
                    content = response.get("content", {})
                    if "application/json" not in content:
                        continue
                    with self.subTest(path=path, method=method, status=status):
                        self.assertIn(
                            "$ref", content["application/json"]["schema"],
                            "Successful JSON responses must name a Pydantic envelope.",
                        )

    def test_workspace_production_timeline_and_settings_publish_nested_types(self):
        components = self.schema["components"]["schemas"]
        self.assertIn("workspace", components["WorkspaceOverviewResponse"]["required"])
        self.assertIn("productions", components["WorkspaceOverviewResponse"]["required"])
        self.assertIn("files", components["WorkspaceOverviewResponse"]["required"])
        self.assertIn("parts", components["ProductionEditorResponse"]["required"])
        self.assertIn("project_id", components["ProductionEditorResponse"]["required"])
        production_update = components["ResourceUpdate"]["properties"]
        self.assertTrue({"project_id", "folder_id"}.issubset(production_update))
        sound_scene = components["SoundSceneUpdateBody"]["properties"]
        self.assertTrue({"expected_revision", "document"}.issubset(sound_scene))
        self.assertIn("storage_settings",
                      components["SettingsSnapshotResponse"]["required"])

    def test_workspace_file_contract_filters_storage_internals(self):
        public_file = WorkspaceFileResponse.model_validate({
            "id": 4,
            "public_id": "file_public_id",
            "workspace_id": 2,
            "name": "Brief",
            "source": "uploaded",
            "path": "/private/origins/workspaces/2/brief.txt",
            "storage_key": "workspaces/2/private/brief.txt",
        }).model_dump()

        self.assertNotIn("path", public_file)
        self.assertNotIn("storage_key", public_file)
        self.assertEqual(public_file["name"], "Brief")


if __name__ == "__main__":
    unittest.main()
