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


class OmniPassageTests(unittest.TestCase):
    def setUp(self):
        self.original = omni._speak_chunk
        self.options = SimpleNamespace(
            model_id="qwen3.5-omni-plus", voice="fixture-voice",
            instruction=None, speech_mode="exact", format="wav")

    def tearDown(self):
        omni._speak_chunk = self.original

    def test_long_input_is_planned_before_the_first_provider_call(self):
        source = " ".join(f"word{index}" for index in range(100))
        calls = []

        def fake(text, *_args):
            calls.append(text)
            return response(text, text, len(calls))

        omni._speak_chunk = fake
        audio, failures, transcripts, usage, request_ids, diagnostics = \
            omni.synthesize([source], self.options)

        self.assertTrue(audio)
        self.assertEqual(failures, [])
        self.assertGreater(len(calls), 1)
        self.assertTrue(all(len(item) <= omni.PASSAGE_TARGET_CHARS
                            for item in calls))
        self.assertEqual(" ".join(transcripts).split(), source.split())
        self.assertTrue(all(item["status"] == "accepted"
                            for item in diagnostics))
        self.assertTrue(all(item["finish_reason"] == "stop"
                            for item in diagnostics))
        self.assertEqual(len(request_ids), len(calls))
        self.assertEqual(usage["total"], 9 * len(calls))

    def test_one_missing_word_is_retried_then_reported_with_evidence(self):
        source = "one two three four five six seven eight nine ten"
        calls = []

        def fake(text, *_args):
            calls.append(text)
            returned = " ".join(text.split()[:-1])
            return response(text, returned, 1)

        omni._speak_chunk = fake
        with self.assertRaisesRegex(
                omni.OmniSynthesisError, "incomplete speech") as caught:
            omni.synthesize([source], self.options)
        self.assertEqual(len(calls), omni.MAX_ATTEMPTS_PER_PASSAGE)
        self.assertEqual(caught.exception.usage["total"], 18)
        self.assertEqual(len(caught.exception.request_ids), 2)
        self.assertEqual(len(caught.exception.diagnostics), 2)

    def test_incomplete_planned_passage_is_replaced_by_short_children(self):
        source = " ".join(f"word{index}" for index in range(35))
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
        self.assertEqual(" ".join(transcripts).split(), source.split())
        self.assertEqual(diagnostics[0]["status"], "replaced")
        self.assertEqual(len(request_ids), len(calls))
        self.assertEqual(usage["total"], 9 * len(calls))

    def test_unrecoverable_later_passage_fails_the_whole_render(self):
        first = "this complete opening has enough words to remain accepted"
        second = " ".join(f"missing{index}" for index in range(16))

        def fake(text, *_args):
            returned = text if text == first else ""
            return response(text, returned, 2)

        omni._speak_chunk = fake
        with self.assertRaises(omni.OmniSynthesisError) as caught:
            omni.synthesize([first, second], self.options)
        self.assertTrue(caught.exception.failures)
        self.assertTrue(any(item["status"] == "incomplete"
                            for item in caught.exception.diagnostics))

    def test_provider_error_is_not_retried_or_split(self):
        source = " ".join(f"word{index}" for index in range(35))
        calls = []

        def fake(text, *_args):
            calls.append(text)
            raise RuntimeError("provider unavailable")

        omni._speak_chunk = fake
        with self.assertRaisesRegex(
                omni.OmniSynthesisError, "provider unavailable") as caught:
            omni.synthesize([source], self.options)

        self.assertEqual(calls, [source])
        self.assertEqual(len(caught.exception.failures), 1)
        self.assertEqual(caught.exception.diagnostics[0]["status"], "error")

    def test_arabic_passages_keep_every_word_and_order(self):
        source = ("الله لم ينسك اليوم. " * 30).strip()
        passages = omni.plan_passages([source])
        self.assertGreater(len(passages), 1)
        self.assertEqual(" ".join(passages).split(), source.split())
        self.assertTrue(all(len(item) <= omni.PASSAGE_TARGET_CHARS
                            for item in passages))


if __name__ == "__main__":
    unittest.main()
