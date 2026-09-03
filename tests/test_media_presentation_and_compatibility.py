import unittest

from origins.application.media_generation import MediaGenerationService
from origins.domain.media_generation import (
    _validate_input_file, file_list_compatibility_contract,
    input_file_compatibility,
)
from origins.domain.media_models import OPERATION_TAXONOMY, model_capability


class _Files:
    def __init__(self, files):
        self.files = files

    def production_exists(self, production_id):
        return production_id == 7

    def workspace_exists(self, workspace_id):
        return workspace_id == 4

    def list_for_production(self, production_id):
        return self.files if production_id == 7 else []

    def list_for_workspace(self, workspace_id):
        return self.files if workspace_id == 4 else []


class CreatorCompatibilityTest(unittest.TestCase):
    @staticmethod
    def slot(model_id, operation, role):
        _, selected = model_capability(model_id, operation)
        return next(item for item in selected["inputs"] if item["role"] == role)

    def test_picker_contract_rejects_every_declared_technical_constraint(self):
        image_slot = self.slot(
            "kling-3.0-omni/image-to-video", "image_to_video", "source-image")
        base_image = {
            "media_type": "image", "mime_type": "image/png",
            "size_bytes": 40_000, "width": 1280, "height": 720,
        }
        cases = [
            ({**base_image, "mime_type": "image/gif"}, "file format"),
            ({**base_image, "size_bytes": 50_000_001}, "larger"),
            ({**base_image, "width": 299}, "too narrow"),
            ({**base_image, "height": 299}, "too short"),
            ({**base_image, "width": 300, "height": 751}, "aspect ratio is too narrow"),
            ({**base_image, "width": 751, "height": 300}, "aspect ratio is too wide"),
        ]
        video_slot = self.slot(
            "kling-3.0-omni/reference-to-video", "reference_to_video",
            "reference-video")
        base_video = {
            "media_type": "video", "mime_type": "video/mp4",
            "size_bytes": 20_000, "duration_ms": 8_000,
            "width": 1920, "height": 1080, "frame_rate": 30,
        }
        cases += [
            ({**base_video, "media_type": "audio"}, "does not accept"),
            ({**base_video, "duration_ms": 2_999}, "shorter"),
            ({**base_video, "duration_ms": 15_501}, "longer"),
            ({**base_video, "width": 699}, "too narrow"),
            ({**base_video, "height": 699}, "too short"),
            ({**base_video, "width": 4554}, "too wide"),
            ({**base_video, "height": 4554}, "too tall"),
            ({**base_video, "width": 3841, "height": 2160}, "resolution is too large"),
            ({**base_video, "width": 800, "height": 2001}, "aspect ratio is too narrow"),
            ({**base_video, "width": 2001, "height": 1000}, "aspect ratio is too wide"),
            ({**base_video, "frame_rate": 23.99}, "frame rate"),
            ({**base_video, "frame_rate": 60.01}, "frame rate"),
        ]
        for file, message in cases:
            slot = image_slot if file["media_type"] == "image" else video_slot
            with self.subTest(message=message):
                result = input_file_compatibility(slot, file)
                self.assertEqual(result["state"], "incompatible")
                self.assertIn(message, " ".join(result["reasons"]))

    def test_exact_constraint_boundaries_are_compatible(self):
        slot = self.slot(
            "kling-3.0-omni/reference-to-video", "reference_to_video",
            "reference-video")
        minimums = {
            "media_type": "video", "mime_type": "video/mp4",
            "size_bytes": 200_000_000, "duration_ms": 3_000,
            "width": 700, "height": 700, "frame_rate": 24,
        }
        minimum_aspect = {
            **minimums, "width": 700, "height": 1750,
        }
        maximums = {
            "media_type": "video", "mime_type": "video/quicktime",
            "size_bytes": 200_000_000, "duration_ms": 15_500,
            "width": 3840, "height": 2160, "frame_rate": 60,
        }
        maximum_aspect = {
            **maximums, "width": 3840, "height": 1920,
        }
        for file in (minimums, minimum_aspect, maximums, maximum_aspect):
            with self.subTest(file=file):
                self.assertEqual(
                    input_file_compatibility(slot, file)["state"],
                    "compatible",
                )

    def test_unknown_metadata_is_not_selectable_or_payable(self):
        slot = self.slot(
            "kling-3.0-omni/image-to-video", "image_to_video", "source-image")
        file = {"id": 11, "media_type": "image", "mime_type": "image/png",
                 "size_bytes": 1000, "width": None, "height": None}
        self.assertEqual(input_file_compatibility(slot, file)["state"], "unknown")
        with self.assertRaisesRegex(ValueError, "Re-import"):
            _validate_input_file(slot, file)
        service = MediaGenerationService(object(), _Files([file]))
        result = service.input_compatibility(
            {"workspace_id": 4, "production_id": 7},
            "kling-3.0-omni/image-to-video", "image_to_video",
            [11], role="source-image")
        self.assertEqual(result[0]["state"], "unknown")

    def test_nested_subject_picker_uses_the_same_technical_contract(self):
        model_id = "kling-3.0-omni/text-to-video"
        operation = "text_to_video"
        _, capability = model_capability(model_id, operation)
        field = next(
            item for item in capability["parameters"]
            if item["key"] == "elements"
        )
        image_contract = file_list_compatibility_contract(
            field, variant_id="images")
        audio_contract = file_list_compatibility_contract(field, audio=True)
        narrow_image = {
            "id": 21, "media_type": "image", "mime_type": "image/png",
            "size_bytes": 10_000, "width": 200, "height": 720,
        }
        short_audio = {
            "id": 22, "media_type": "audio", "mime_type": "audio/wav",
            "size_bytes": 10_000, "duration_ms": 4_999,
        }
        self.assertEqual(
            input_file_compatibility(image_contract, narrow_image)["state"],
            "incompatible",
        )
        self.assertEqual(
            input_file_compatibility(audio_contract, short_audio)["state"],
            "incompatible",
        )
        service = MediaGenerationService(
            object(), _Files([narrow_image, short_audio]))
        image_result = service.input_compatibility(
            {"workspace_id": 4, "production_id": 7}, model_id, operation, [21],
            parameter_key="elements", variant_id="images")
        audio_result = service.input_compatibility(
            {"workspace_id": 4, "production_id": 7}, model_id, operation, [22],
            parameter_key="elements", audio=True)
        self.assertEqual(image_result[0]["state"], "incompatible")
        self.assertIn("too narrow", image_result[0]["reasons"][0])
        self.assertEqual(audio_result[0]["state"], "incompatible")
        self.assertIn("shorter", audio_result[0]["reasons"][0])


class CreatorPresentationTest(unittest.TestCase):
    def test_operation_modes_are_explicit_for_current_and_future_routes(self):
        presentation = {
            item["id"]: item["presentation"]["mode_label"]
            for item in OPERATION_TAXONOMY
        }
        self.assertEqual(presentation["text_to_video"], "Text")
        self.assertEqual(presentation["image_to_video"], "Image")
        self.assertEqual(presentation["frames_to_video"], "Frames")
        self.assertEqual(presentation["reference_to_video"], "References")
        self.assertEqual(presentation["video_continue"], "Continue")
        self.assertEqual(presentation["video_lip_sync"], "Lip sync")
        self.assertEqual(presentation["talking_video"], "Talking")
        self.assertEqual(presentation["video_edit"], "Edit")


if __name__ == "__main__":
    unittest.main()
