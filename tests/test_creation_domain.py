import unittest
from uuid import uuid4

from origins.domain.creation import (
    CreationAction,
    CreationContext,
    CreationField,
    CreationPreset,
    CreationRegistry,
    CreationResult,
)
from origins.domain.files import File, FileVersion, file_family


class FakeEngine:
    id = "stable-audio"

    def execute(self, action, *, inputs, parameters, context):
        return CreationResult((31,), {"mime_type": "audio/wav"})


class CreationDomainTests(unittest.TestCase):
    def action(self):
        return CreationAction(
            id="generate-music",
            label="Generate music",
            description="Create music from a prompt.",
            engine_id="stable-audio",
            capability_id="music.generate",
            inputs=(CreationField("prompt", "Prompt", "text", True),),
            parameters=(CreationField("duration", "Duration", "number", True),),
            output_mime_types=("audio/wav",),
            supported_contexts=("workspace", "audiovisual-project"),
        )

    def test_registry_resolves_action_preset_and_engine(self):
        registry = CreationRegistry()
        engine = FakeEngine()
        action = self.action()
        preset = CreationPreset(
            "cinematic", action.id, "Cinematic underscore",
            {"duration": 30}, frozenset(),
        )
        registry.register_engine(engine)
        registry.register_action(action)
        registry.register_preset(preset)

        self.assertEqual(registry.actions("workspace"), (action,))
        self.assertIs(registry.engine_for(action), engine)
        self.assertEqual(registry.preset("cinematic"), preset)
        result = engine.execute(
            action, inputs={"prompt": "Warm strings"},
            parameters=preset.values,
            context=CreationContext(workspace_id=4))
        self.assertEqual(result.output_file_ids, (31,))

    def test_presets_cannot_invent_action_fields(self):
        registry = CreationRegistry()
        registry.register_action(self.action())
        with self.assertRaisesRegex(ValueError, "unknown fields"):
            registry.register_preset(CreationPreset(
                "bad", "generate-music", "Bad", {"mood": "warm"}))

    def test_full_creation_context_keeps_workspace_as_the_only_root(self):
        self.assertEqual(CreationContext(workspace_id=8).project_id, None)
        context = CreationContext(
            workspace_id=8,
            folder_id=12,
            project_id=14,
            project_type="audiovisual",
            object_id=16,
            selection={"capability": "image"},
        )
        self.assertEqual(context.folder_id, 12)
        self.assertEqual(context.project_id, 14)
        self.assertEqual(context.project_type, "audiovisual")
        self.assertEqual(context.object_id, 16)
        with self.assertRaisesRegex(ValueError, "requires a Workspace"):
            CreationContext(workspace_id=0)

    def test_mime_type_drives_open_file_family(self):
        cases = {
            "audio/wav": "audio",
            "image/avif": "image",
            "video/mp4": "video",
            "application/x-subrip": "subtitle",
            "text/markdown": "document",
            "application/json": "data",
            "application/zip": "archive",
            "application/vnd.future-format": "other",
        }
        for mime_type, family in cases.items():
            with self.subTest(mime_type=mime_type):
                self.assertEqual(file_family(mime_type), family)

    def test_file_location_is_independent_from_version_storage(self):
        file = File(1, uuid4(), 2, "Episode outline", 7, folder_id=9)
        version = FileVersion(
            7, uuid4(), file.id, 1,
            "workspaces/2/files/1/versions/7/original.md",
            "outline.md", "text/markdown", 120,
        )
        moved = File(1, file.public_id, 2, file.name, 7, folder_id=10)

        self.assertNotEqual(file.folder_id, moved.folder_id)
        self.assertEqual(version.storage_key,
                         "workspaces/2/files/1/versions/7/original.md")
        self.assertEqual(version.family, "document")


if __name__ == "__main__":
    unittest.main()
