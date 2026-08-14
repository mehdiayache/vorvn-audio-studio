"""Qwen3 TTS HTTP adapter contracts; no Alibaba calls."""

from contextlib import nullcontext
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.providers.alibaba import qwen_tts


class QwenTtsTests(unittest.TestCase):
    def test_documented_language_is_explicit_and_experimental_uses_auto(self):
        self.assertEqual(qwen_tts._language_type("English"), "English")
        self.assertEqual(qwen_tts._language_type("Arabic"), "Auto")
        self.assertEqual(qwen_tts._language_type("Auto"), "Auto")

    def options(self):
        return SimpleNamespace(
            model_id="qwen3-tts-vc-2026-01-22",
            voice="qwen3-tts-vc-fixture", language="English",
            format="mp3",
        )

    def test_non_streaming_contract_and_chunk_assembly(self):
        rendered = qwen_tts.ChunkResult(
            b"wav", {"characters": 6}, "request-fixture", "stop")
        progress = []
        with patch.object(qwen_tts, "_render", return_value=rendered) as call, \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3") as encode:
            result = qwen_tts.synthesize(
                qwen_tts.QwenTtsPlan(("hello", "world")), self.options(),
                on_progress=lambda *values: progress.append(values))
        audio, failures, transcripts, usage, request_ids, diagnostics = result
        self.assertEqual(audio, b"mp3")
        self.assertEqual((failures, transcripts), ([], []))
        self.assertEqual(usage["characters"], 12)
        self.assertEqual(request_ids, ["request-fixture", "request-fixture"])
        self.assertEqual(len(diagnostics), 2)
        self.assertEqual(progress, [(1, 2, "hello"), (2, 2, "world")])
        self.assertEqual(call.call_count, 2)
        encode.assert_called_once_with(b"pcmpcm", "mp3")

    def test_http_request_uses_the_documented_regional_qwen_tts_endpoint(self):
        response = io.BytesIO(json.dumps({
            "output": {"audio": {"url": "https://audio.example/out.wav"}},
            "usage": {},
        }).encode())
        with patch.dict("os.environ", {"DASHSCOPE_API_KEY": "test-key"}), \
                patch.object(qwen_tts.config, "regional_http_base",
                             return_value="https://dashscope-intl.aliyuncs.com/api/v1"), \
                patch.object(qwen_tts.urllib.request, "urlopen",
                             return_value=nullcontext(response)) as urlopen:
            qwen_tts._post("Hello", self.options())
        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/"
            "multimodal-generation/generation",
        )
        payload = json.loads(request.data)
        self.assertEqual(payload["input"]["language_type"], "English")
        self.assertEqual(payload["input"]["voice"], "qwen3-tts-vc-fixture")

    def test_experimental_language_keeps_a_valid_auto_request(self):
        response = io.BytesIO(json.dumps({
            "output": {"audio": {"url": "https://audio.example/out.wav"}},
            "usage": {},
        }).encode())
        experimental = self.options()
        experimental.language = "Arabic"
        with patch.dict("os.environ", {"DASHSCOPE_API_KEY": "test-key"}), \
                patch.object(qwen_tts.config, "regional_http_base",
                             return_value="https://provider.example/api/v1"), \
                patch.object(qwen_tts.urllib.request, "urlopen",
                             return_value=nullcontext(response)) as urlopen:
            qwen_tts._post("مرحبا", experimental)
        payload = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(payload["input"]["language_type"], "Auto")

    def test_failed_segment_makes_the_whole_take_atomic(self):
        with patch.object(
                qwen_tts, "_render",
                side_effect=[RuntimeError("provider timeout"),
                             qwen_tts.ChunkResult(
                                 b"wav", {}, "request-good", "stop")]), \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3"):
            audio, failures, *_ = qwen_tts.synthesize(
                qwen_tts.QwenTtsPlan(("first", "second")),
                self.options(), retries=1)
        self.assertEqual(audio, b"")
        self.assertEqual(failures[0].index, 1)
        self.assertIn("provider timeout", failures[0].error)

    def test_transport_failure_is_not_automatically_retried(self):
        with patch.object(
                qwen_tts, "_render",
                side_effect=RuntimeError("temporary timeout")) as call, \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3"), \
                patch.object(qwen_tts.time, "sleep"):
            audio, failures, *_ = qwen_tts.synthesize(
                qwen_tts.QwenTtsPlan(("retry me",)), self.options())
        self.assertEqual(audio, b"")
        self.assertEqual(len(failures), 1)
        self.assertEqual(call.call_count, 1)

    def test_unsupported_language_is_not_retried(self):
        with patch.object(
                qwen_tts, "_render",
                side_effect=RuntimeError(
                    "invalid_parameter: unsupported language_type Arabic")) as call, \
                patch.object(qwen_tts.time, "sleep") as sleep:
            audio, failures, *_ = qwen_tts.synthesize(
                qwen_tts.QwenTtsPlan(("مرحبا",)), self.options())
        self.assertEqual(audio, b"")
        self.assertIn("unsupported language_type Arabic", failures[0].error)
        self.assertEqual(call.call_count, 1)
        sleep.assert_not_called()

    def test_planner_uses_a_qwen_specific_token_budget(self):
        planned = qwen_tts.plan("Arabic مرحبا. " * 300)
        self.assertGreater(planned.request_count, 1)
        self.assertTrue(all(
            qwen_tts.token_budget.conservative_qwen_tokens(segment)
            <= qwen_tts.TOKEN_BUDGET
            for segment in planned.segments))

    def test_provider_length_error_replans_at_a_natural_boundary(self):
        source = "First complete sentence. Second complete sentence."
        rendered = qwen_tts.ChunkResult(
            b"wav", {}, "request", "stop")
        with patch.object(
                qwen_tts, "_render",
                side_effect=[RuntimeError("maximum input length exceeded"),
                             rendered, rendered]) as call, \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3"):
            audio, failures, *_rest, diagnostics = qwen_tts.synthesize(
                qwen_tts.QwenTtsPlan((source,)), self.options())
        self.assertEqual((audio, failures), (b"mp3", []))
        self.assertEqual(call.call_count, 3)
        self.assertEqual(diagnostics[0]["status"], "provider_limit_replanned")


if __name__ == "__main__":
    unittest.main()
