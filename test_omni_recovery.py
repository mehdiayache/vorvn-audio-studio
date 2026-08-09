"""Omni completeness recovery contracts; every provider response is fake."""

from types import SimpleNamespace
import unittest

from audio_studio.infrastructure.alibaba import omni


def response(text: str, returned: str, marker: int) -> omni.ChunkResponse:
    return omni.ChunkResponse(
        audio=bytes([marker, 0]) * 20,
        text=returned,
        usage={"input_text": 2, "input_audio": 0, "output_text": 3,
               "output_audio": 4, "total": 9},
        request_id=f"request-{marker}", finish_reason="stop", event_count=5,
    )


class OmniRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.original = omni._speak_chunk
        self.options = SimpleNamespace(
            model_id="qwen3.5-omni-plus", voice="fixture-voice",
            instruction=None, speech_mode="exact", format="wav")

    def tearDown(self):
        omni._speak_chunk = self.original

    def test_incomplete_parent_is_replaced_by_complete_children(self):
        source = " ".join(f"word{index}" for index in range(24))
        calls = []

        def fake(text, *_args):
            calls.append(text)
            returned = " ".join(text.split()[:6]) if text == source else text
            return response(text, returned, len(calls))

        omni._speak_chunk = fake
        audio, failures, transcripts, usage, request_ids, diagnostics = \
            omni.synthesize([source], self.options)

        self.assertTrue(audio)
        self.assertEqual(failures, [])
        self.assertEqual(transcripts[0].split(), source.split())
        self.assertGreater(len(calls), 1)
        self.assertEqual(diagnostics[0]["status"], "replaced")
        self.assertTrue(all(item["finish_reason"] == "stop"
                            for item in diagnostics))
        self.assertEqual(len(request_ids), len(calls))
        self.assertEqual(usage["total"], 9 * len(calls))

    def test_one_missing_word_is_not_accepted_as_complete(self):
        source = "one two three four five six seven eight nine ten"
        calls = []

        def fake(text, *_args):
            calls.append(text)
            returned = " ".join(text.split()[:-1])
            return response(text, returned, 1)

        omni._speak_chunk = fake
        with self.assertRaisesRegex(RuntimeError, "incomplete speech"):
            omni.synthesize([source], self.options)
        self.assertLessEqual(len(calls), omni.MAX_CALLS_PER_SEGMENT)

    def test_unrecoverable_later_segment_never_uses_its_partial_audio(self):
        first = "this complete opening has enough words to remain accepted"
        second = " ".join(f"missing{index}" for index in range(16))

        def fake(text, *_args):
            returned = text if text == first else ""
            return response(text, returned, 2)

        omni._speak_chunk = fake
        audio, failures, transcripts, _usage, _ids, diagnostics = \
            omni.synthesize([first, second], self.options)

        self.assertTrue(audio)
        self.assertEqual(transcripts, [first])
        self.assertTrue(failures)
        self.assertTrue(any(item["status"] == "incomplete"
                            for item in diagnostics))


if __name__ == "__main__":
    unittest.main()
