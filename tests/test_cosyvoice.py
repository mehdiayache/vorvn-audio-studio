"""CosyVoice V3 Plus contract tests; every provider call is faked."""

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.providers.alibaba import cosyvoice


def options(**changes):
    values = {
        "model": "plus", "voice": "cosyvoice-fixture", "format": "mp3",
        "rate": 1.0, "pitch": 1.0, "volume": 50, "language": "English",
        "seed": 17, "hot_fix": None,
    }
    values.update(changes)
    return SimpleNamespace(**values)


class CosyVoiceTests(unittest.TestCase):
    def test_plain_text_uses_continuous_bounded_sessions(self):
        planned = cosyvoice.plan("A faithful sentence. " * 2_000)
        self.assertGreaterEqual(planned.request_count, 1)
        self.assertFalse(planned.ssml)
        self.assertTrue(all(
            len(segment) <= cosyvoice.TEXT_PER_SEND
            for session in planned.sessions for segment in session))

    def test_ssml_is_one_valid_document_and_is_never_split(self):
        planned = cosyvoice.plan(
            '<speak>Hello <prosody rate="slow">world</prosody>.</speak>',
            ssml=True)
        self.assertTrue(planned.ssml)
        self.assertEqual(len(planned.sessions), 1)
        self.assertEqual(len(planned.sessions[0]), 1)
        with self.assertRaisesRegex(ValueError, "<speak>"):
            cosyvoice.plan("<p>Not SSML</p>", ssml=True)

    def test_constructor_receives_only_documented_native_options(self):
        with patch.object(cosyvoice, "SpeechSynthesizer") as constructor:
            cosyvoice._synthesizer(
                options(), callback=cosyvoice._CosyVoiceCollector(), ssml=True)
        sent = constructor.call_args.kwargs
        self.assertEqual(sent["model"], "cosyvoice-v3-plus")
        self.assertEqual(sent["voice"], "cosyvoice-fixture")
        self.assertEqual(sent["language_hints"], ["en"])
        self.assertEqual(sent["seed"], 17)
        self.assertEqual(sent["additional_params"], {
            "word_timestamp_enabled": True, "enable_ssml": True,
        })
        self.assertNotIn("instruction", sent)

    def test_pronunciation_hot_fix_uses_the_documented_native_parameter(self):
        hot_fix = {"pronunciation": [{"VORVN": "vor ven"}]}
        with patch.object(cosyvoice, "SpeechSynthesizer") as constructor:
            cosyvoice._synthesizer(
                options(hot_fix=hot_fix),
                callback=cosyvoice._CosyVoiceCollector(), ssml=False)
        sent = constructor.call_args.kwargs
        self.assertEqual(sent["hot_fix"], hot_fix)
        self.assertNotIn("hot_fix", sent["additional_params"])

    def test_word_timestamp_events_are_preserved_in_diagnostics(self):
        collector = cosyvoice._CosyVoiceCollector()
        collector.on_event({
            "output": {"sentence": {"words": [{
                "text": "Hello", "begin_time": 0, "end_time": 420,
                "begin_index": 0, "end_index": 5,
            }]}}
        })
        collector.on_event({
            "output": {"sentence": {"words": [
                {"text": "Hello", "begin_time": 0, "end_time": 440,
                 "begin_index": 0, "end_index": 5},
                {"text": " world", "begin_time": 480, "end_time": 900,
                 "begin_index": 5, "end_index": 11},
            ]}}
        })
        self.assertEqual(len(collector.word_timestamps), 2)
        self.assertEqual(collector.word_timestamps[0]["text"], "Hello")
        self.assertEqual(collector.word_timestamps[0]["end_time"], 440)

    def test_transport_failure_is_not_automatically_retried(self):
        planned = cosyvoice.CosyVoicePlan((("hello",),))
        with patch.object(cosyvoice, "_render_session",
                          side_effect=RuntimeError("timeout")) as render:
            audio, failures, *_ = cosyvoice.synthesize(planned, options())
        self.assertEqual(audio, b"")
        self.assertEqual(len(failures), 1)
        self.assertEqual(render.call_count, 1)

    def test_seed_is_bounded_to_the_provider_contract(self):
        with self.assertRaisesRegex(ValueError, "65,535"):
            cosyvoice._synthesizer(
                options(seed=65_536), callback=cosyvoice._CosyVoiceCollector(),
                ssml=False)


if __name__ == "__main__":
    unittest.main()
