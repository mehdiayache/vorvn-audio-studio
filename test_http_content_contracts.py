"""OpenAPI contracts for Batch preview and the saved Subtitle catalogue."""

import unittest

from audio_studio.http.app import app


class ContentContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = app.openapi()

    def response_schema(self, path: str, method: str) -> dict:
        return self.schema["paths"][path][method]["responses"]["200"][
            "content"]["application/json"]["schema"]

    def test_operations_reference_explicit_envelopes(self):
        expected = {
            ("/api/v1/batches/preview", "post"): "BatchPreviewEnvelope",
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
        self.assertIn("preview", components["BatchPreviewResponse"]["required"])
        self.assertIn("sentences", components["SubtitleResponse"]["required"])
        self.assertIn("timing_quality",
                      components["CaptionLayoutResponse"]["required"])
        profile = components["CaptionProfileResponse"]["properties"]["key"]
        self.assertEqual(profile["enum"], ["standard", "short", "words"])


if __name__ == "__main__":
    unittest.main()
