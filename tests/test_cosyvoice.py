"""CosyVoice V3 Plus contract tests; every provider call is faked."""

from types import SimpleNamespace
import json
import unittest
from unittest.mock import MagicMock, patch

from origins.providers.alibaba import cosyvoice


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
        partial = {
            "payload": {
                "output": {
                    "type": "sentence-synthesis",
                    "sentence": {
                        "index": 0,
                        "words": [{
                            "text": "Hello", "begin_time": 0,
                            "end_time": 420,
                        }],
                    },
                },
            },
        }
        final = {
            "payload": {
                "output": {
                    "type": "sentence-end",
                    "sentence": {
                        "index": 0,
                        "words": [
                            {"text": "Hello", "begin_time": 0,
                             "end_time": 440},
                            {"text": "world", "begin_time": 480,
                             "end_time": 900},
                        ],
                    },
                },
            },
        }
        collector.on_event(partial)
        collector.on_event(json.dumps(final))
        self.assertEqual(len(collector.word_timestamps), 2)
        self.assertEqual(collector.word_timestamps[0]["text"], "Hello")
        self.assertEqual(collector.word_timestamps[0]["end_time"], 440)
        self.assertEqual(collector.word_timestamps[1]["word_index"], 1)

    def test_repeated_words_without_character_indexes_are_not_collapsed(self):
        collector = cosyvoice._CosyVoiceCollector()
        for sentence_index, begin in ((0, 0), (1, 500)):
            collector.on_event({"payload": {"output": {
                "type": "sentence-end", "sentence": {
                    "index": sentence_index,
                    "words": [
                        {"text": "rest", "begin_time": begin,
                         "end_time": begin + 200},
                        {"text": "rest", "begin_time": begin + 220,
                         "end_time": begin + 420},
                    ],
                },
            }}})
        self.assertEqual(
            [row["text"] for row in collector.word_timestamps],
            ["rest", "rest", "rest", "rest"],
        )
        self.assertEqual(
            [row["sentence_index"] for row in collector.word_timestamps],
            [0, 0, 1, 1],
        )

    def test_transport_failure_is_not_automatically_retried(self):
        planned = cosyvoice.CosyVoicePlan((("hello",),))
        with patch.object(cosyvoice, "_render_session",
                          side_effect=RuntimeError("timeout")) as render:
            audio, failures, *_ = cosyvoice.synthesize(planned, options())
        self.assertEqual(audio, b"")
        self.assertEqual(len(failures), 1)
        self.assertEqual(render.call_count, 1)

    def test_ssml_uses_documented_unidirectional_call(self):
        synthesizer = MagicMock()
        synthesizer.get_last_request_id.return_value = "request-ssml"
        with patch.object(cosyvoice, "_synthesizer", return_value=synthesizer):
            with self.assertRaisesRegex(RuntimeError, "no audio"):
                cosyvoice._render_session(
                    ('<speak>Hello <break time="300ms"/>world.</speak>',),
                    options(), ssml=True)
        synthesizer.call.assert_called_once_with(
            '<speak>Hello <break time="300ms"/>world.</speak>')
        synthesizer.streaming_call.assert_not_called()
        synthesizer.streaming_complete.assert_not_called()

    def test_plain_text_keeps_documented_duplex_streaming(self):
        synthesizer = MagicMock()
        with patch.object(cosyvoice, "_synthesizer", return_value=synthesizer):
            with self.assertRaisesRegex(RuntimeError, "no audio"):
                cosyvoice._render_session(
                    ("First sentence.", "Second sentence."),
                    options(), ssml=False)
        self.assertEqual(
            [call.args[0] for call in synthesizer.streaming_call.call_args_list],
            ["First sentence.", "Second sentence."],
        )
        synthesizer.streaming_complete.assert_called_once_with()
        synthesizer.call.assert_not_called()

    def test_session_diagnostics_include_measured_pcm_duration(self):
        planned = cosyvoice.CosyVoicePlan((("hello",), ("again",)))
        first = b"\0\0" * 48_000
        second = b"\0\0" * 24_000
        with patch.object(cosyvoice, "_render_session", side_effect=[
            (first, "request-one", [{"text": "hello", "begin_time": 0,
                                      "end_time": 800, "sentence_index": 0}]),
            (second, "request-two", [{"text": "again", "begin_time": 0,
                                       "end_time": 400, "sentence_index": 0}]),
        ]), patch.object(cosyvoice.audio_codec, "encode_pcm", return_value=b"audio"):
            _, failures, _, _, _, diagnostics = cosyvoice.synthesize(
                planned, options())
        self.assertEqual(failures, [])
        self.assertEqual(
            [item["audio_duration_ms"] for item in diagnostics], [1000, 500])

    def test_seed_is_bounded_to_the_provider_contract(self):
        with self.assertRaisesRegex(ValueError, "65,535"):
            cosyvoice._synthesizer(
                options(seed=65_536), callback=cosyvoice._CosyVoiceCollector(),
                ssml=False)


if __name__ == "__main__":
    unittest.main()
