"""Qwen3 TTS HTTP adapter contracts; no Alibaba calls."""

from contextlib import nullcontext
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.infrastructure.alibaba import qwen_tts


class QwenTtsTests(unittest.TestCase):
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
                ["hello", "world"], self.options(),
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

    def test_failed_chunk_is_explicit_and_good_audio_survives(self):
        with patch.object(
                qwen_tts, "_render",
                side_effect=[RuntimeError("provider timeout"),
                             qwen_tts.ChunkResult(
                                 b"wav", {}, "request-good", "stop")]), \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3"):
            audio, failures, *_ = qwen_tts.synthesize(
                ["first", "second"], self.options(), retries=1)
        self.assertEqual(audio, b"mp3")
        self.assertEqual(failures[0].index, 1)
        self.assertIn("provider timeout", failures[0].error)

    def test_transient_provider_failure_is_retried(self):
        rendered = qwen_tts.ChunkResult(
            b"wav", {}, "request-retry", "stop")
        with patch.object(
                qwen_tts, "_render",
                side_effect=[RuntimeError("temporary timeout"), rendered]) as call, \
                patch.object(qwen_tts, "_pcm", return_value=b"pcm"), \
                patch.object(qwen_tts, "_encode", return_value=b"mp3"), \
                patch.object(qwen_tts.time, "sleep"):
            audio, failures, *_ = qwen_tts.synthesize(
                ["retry me"], self.options())
        self.assertEqual((audio, failures), (b"mp3", []))
        self.assertEqual(call.call_count, 2)

    def test_unsupported_language_is_not_retried(self):
        with patch.object(
                qwen_tts, "_render",
                side_effect=RuntimeError(
                    "invalid_parameter: unsupported language_type Arabic")) as call, \
                patch.object(qwen_tts.time, "sleep") as sleep:
            audio, failures, *_ = qwen_tts.synthesize(
                ["مرحبا"], self.options())
        self.assertEqual(audio, b"")
        self.assertIn("unsupported language_type Arabic", failures[0].error)
        self.assertEqual(call.call_count, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
