import io
import json
import os
import sys
import types
import unittest
from unittest.mock import patch

import transcribe


class Response:
    def __init__(self, output, status_code=200, message="", usage=None):
        self.output = output
        self.status_code = status_code
        self.message = message
        self.usage = usage or {}


PAYLOAD = {"transcripts": [{"sentences": [{
    "begin_time": 0, "end_time": 900, "text": "Hello.",
    "words": [{"begin_time": 0, "end_time": 900, "text": "Hello", "punctuation": "."}],
}]}]}


class TranscriptionContractTests(unittest.TestCase):
    def _module(self, path, name, fake):
        modules = {}
        parts = path.split(".")
        for index in range(1, len(parts) + 1):
            module_name = ".".join(parts[:index])
            modules[module_name] = types.ModuleType(module_name)
        setattr(modules[path], name, fake)
        return patch.dict(sys.modules, modules)

    def setUp(self):
        self.key = patch.dict(os.environ, {"DASHSCOPE_API_KEY": "test-key"})
        self.key.start()

    def tearDown(self):
        self.key.stop()

    def test_qwen_uses_current_filetrans_contract(self):
        class FakeQwen:
            params = None

            @classmethod
            def async_call(cls, **params):
                cls.params = params
                return Response({"task_id": "task-1"})

            @classmethod
            def wait(cls, task):
                self.assertEqual(task, "task-1")
                return Response({"task_status": "SUCCEEDED", "result": {
                    "transcription_url": "https://results.test/transcript.json"}})

        body = io.BytesIO(json.dumps(PAYLOAD).encode())
        with self._module("dashscope.audio.qwen_asr", "QwenTranscription", FakeQwen), \
                patch("urllib.request.urlopen", return_value=body):
            result = transcribe.transcribe("https://audio.test/file.mp3", "Arabic")

        self.assertEqual(FakeQwen.params, {
            "model": "qwen3-asr-flash-filetrans",
            "file_url": "https://audio.test/file.mp3",
            "enable_itn": False,
            "enable_words": True,
            "language": "ar",
        })
        self.assertEqual(result["text"], "Hello.")

    def test_custom_vocabulary_stays_on_fun_asr_contract(self):
        class FakeFun:
            params = None

            @classmethod
            def async_call(cls, **params):
                cls.params = params
                return Response({"task_id": "task-2"})

            @classmethod
            def wait(cls, task):
                return Response({"task_status": "SUCCEEDED", "results": [{
                    "subtask_status": "SUCCEEDED",
                    "transcription_url": "https://results.test/transcript.json"}]})

        body = io.BytesIO(json.dumps(PAYLOAD).encode())
        with self._module("dashscope.audio.asr", "Transcription", FakeFun), \
                patch("urllib.request.urlopen", return_value=body):
            transcribe.transcribe("https://audio.test/file.mp3", "English",
                                  vocabulary_id="vocab-1")

        self.assertEqual(FakeFun.params["model"], "fun-asr")
        self.assertEqual(FakeFun.params["file_urls"], ["https://audio.test/file.mp3"])
        self.assertEqual(FakeFun.params["language_hints"], ["en"])
        self.assertEqual(FakeFun.params["vocabulary_id"], "vocab-1")

    def test_qwen_can_normalize_spoken_numbers_when_requested(self):
        class FakeQwen:
            params = None

            @classmethod
            def async_call(cls, **params):
                cls.params = params
                return Response({"task_id": "task-itn"})

            @classmethod
            def wait(cls, task):
                return Response({"task_status": "SUCCEEDED", "result": {
                    "transcription_url": "https://results.test/transcript.json"}})

        body = io.BytesIO(json.dumps(PAYLOAD).encode())
        with self._module("dashscope.audio.qwen_asr", "QwenTranscription", FakeQwen), \
                patch("urllib.request.urlopen", return_value=body):
            transcribe.transcribe("https://audio.test/file.mp3", enable_itn=True)

        self.assertTrue(FakeQwen.params["enable_itn"])

    def test_failed_qwen_task_exposes_model_error(self):
        class FakeQwen:
            @classmethod
            def async_call(cls, **params):
                return Response({"task_id": "task-3"})

            @classmethod
            def wait(cls, task):
                return Response({"task_status": "FAILED", "code": "InvalidParameter",
                                 "message": "Model not exist."})

        with self._module("dashscope.audio.qwen_asr", "QwenTranscription", FakeQwen):
            with self.assertRaisesRegex(RuntimeError, "Model not exist"):
                transcribe.transcribe("https://audio.test/file.mp3")


if __name__ == "__main__":
    unittest.main()
