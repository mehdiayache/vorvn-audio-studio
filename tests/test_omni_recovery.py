"""Omni completeness recovery contracts; every provider response is fake."""

from types import SimpleNamespace
import unittest

from audio_studio.providers.alibaba import omni


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

    def test_authored_paragraphs_are_planned_before_the_first_provider_call(self):
        source = "First paragraph remains one performance.\n\nSecond paragraph too."
        calls = []

        def fake(text, *_args):
            calls.append(text)
            return response(text, text, len(calls))

        omni._speak_chunk = fake
        audio, failures, transcripts, usage, request_ids, diagnostics = \
            omni.synthesize([source], self.options)

        self.assertTrue(audio)
        self.assertEqual(failures, [])
        self.assertEqual(calls, [
            "First paragraph remains one performance.",
            "Second paragraph too.",
        ])
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

    def test_incomplete_short_child_is_recovered_at_a_finer_boundary(self):
        source = (
            "فقط ابقي قريبة منه وخذي يومك كما يأتي. "
            "تكلمي معه. دعيه يهدي خطاك. وثقي أنه سيقودك خطوة بعد خطوة."
        )
        calls = []

        def fake(text, *_args):
            calls.append(text)
            returned = " ".join(text.split()[:9]) if len(text) > 72 else text
            return response(text, returned, len(calls))

        omni._speak_chunk = fake
        audio, failures, transcripts, _usage, _request_ids, diagnostics = \
            omni.synthesize([source], self.options)

        self.assertTrue(audio)
        self.assertEqual(failures, [])
        self.assertEqual(" ".join(transcripts).split(), source.split())
        self.assertTrue(any(item["path"].count(".") >= 1
                            for item in diagnostics))
        self.assertTrue(all(
            item["status"] in {"accepted", "replaced"}
            for item in diagnostics
        ))

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

    def test_arabic_paragraphs_keep_every_word_and_order(self):
        first = "الله لم ينسك اليوم."
        second = "ابق قريباً وخذ يومك كما يأتي."
        source = f"{first}\n\n{second}"
        passages = omni.plan_passages(source)
        self.assertEqual(passages, [first, second])
        self.assertEqual(" ".join(passages).split(), source.split())

    def test_pathological_trailing_silence_is_trimmed_per_passage(self):
        speech = (1000).to_bytes(2, "little", signed=True) * 24_000
        padding = (0).to_bytes(2, "little", signed=True) * (24_000 * 145)

        trimmed, removed_ms = omni._trim_pathological_trailing_silence(
            speech + padding)

        self.assertEqual(removed_ms, 144_650)
        self.assertEqual(
            len(trimmed),
            (24_000 + int(24_000 * omni.KEPT_TRAILING_SILENCE_SECONDS)) * 2,
        )

    def test_natural_trailing_pause_is_preserved(self):
        speech = (1000).to_bytes(2, "little", signed=True) * 24_000
        pause = (0).to_bytes(2, "little", signed=True) * (24_000 * 2)

        untouched, removed_ms = omni._trim_pathological_trailing_silence(
            speech + pause)

        self.assertEqual(untouched, speech + pause)
        self.assertEqual(removed_ms, 0)


if __name__ == "__main__":
    unittest.main()
