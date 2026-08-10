"""Qwen Audio provider sessions; every Alibaba call is faked."""

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from audio_studio.domain import speech_segments, speech_text
from audio_studio.infrastructure.alibaba import audio_tts


def options():
    return SimpleNamespace(
        model="flash", voice="fixture", format="mp3", rate=1.0,
        pitch=1.0, volume=50, instruction=None, language="English", seed=0,
        hot_fix=None, extra_params=None,
        enable_tn=None, optimize_instructions=None,
        enable_markdown_filter=None, enable_ssml=None,
    )


class AudioTtsTests(unittest.TestCase):
    def test_language_labels_become_documented_codes_or_auto_detection(self):
        self.assertEqual(audio_tts._language_hints("English"), ["en"])
        self.assertEqual(audio_tts._language_hints("id"), ["id"])
        self.assertIsNone(audio_tts._language_hints("Arabic"))
        self.assertIsNone(audio_tts._language_hints("Auto"))
        with patch.object(audio_tts, "SpeechSynthesizer") as constructor:
            audio_tts._synthesizer(
                options(), callback=audio_tts._PcmCollector())
        self.assertEqual(constructor.call_args.kwargs["language_hints"], ["en"])

    def test_bounded_submissions_keep_the_active_mood(self):
        segments = audio_tts._carry_mood_tags(
            ["[whispers] hello world.", "The story continues."], limit=80)
        self.assertEqual(segments, [
            "[whispers] hello world.",
            "[whispers] The story continues.",
        ])
        long_text = "[asmr] " + "A calm sentence. " * 80
        bounded = audio_tts._carry_mood_tags(
            speech_segments.split_text(long_text, limit=120), limit=120)
        self.assertTrue(all(len(item) <= 120 for item in bounded))
        self.assertTrue(all(item.startswith("[asmr]") for item in bounded))
        self.assertEqual(
            speech_text.strip_tags(" ".join(bounded)).count("A calm sentence."),
            80,
        )

    def test_native_session_submits_every_segment_then_completes_once(self):
        events = []

        class FakeSynthesizer:
            def __init__(self, callback):
                self.callback = callback

            def streaming_call(self, text):
                events.append(("send", text))

            def streaming_complete(self):
                events.append(("complete", None))
                self.callback.on_data(b"continuous-pcm")

            @staticmethod
            def get_last_request_id():
                return "request-native-session"

        def create_synthesizer(_options, *, callback):
            return FakeSynthesizer(callback)

        with patch.object(audio_tts, "_synthesizer",
                          side_effect=create_synthesizer):
            pcm, request_id = audio_tts._render_session(
                ("first paragraph", "second paragraph"), options())
        self.assertEqual(pcm, b"continuous-pcm")
        self.assertEqual(request_id, "request-native-session")
        self.assertEqual(events, [
            ("send", "first paragraph"),
            ("send", "second paragraph"),
            ("complete", None),
        ])

    def test_normal_script_is_one_continuous_provider_session(self):
        text = ("First paragraph.\n\nSecond paragraph with more words. " * 20)
        planned = audio_tts.plan(text)
        self.assertEqual(planned.request_count, 1)
        self.assertEqual(planned.segment_count, 1)
        self.assertEqual(planned.sessions[0][0], text.strip())

    def test_provider_send_and_session_limits_are_independent(self):
        text = "Sentence with words. " * 20_000
        planned = audio_tts.plan(text)
        self.assertGreater(planned.segment_count, 1)
        self.assertTrue(all(
            len(segment) <= audio_tts.TEXT_PER_SEND
            for session in planned.sessions for segment in session))
        self.assertTrue(all(
            sum(len(segment) for segment in session)
            + max(0, len(session) - 1) <= audio_tts.TEXT_PER_SESSION
            for session in planned.sessions))

    def test_one_session_uses_one_task_and_encodes_pcm_once(self):
        planned = audio_tts.AudioPlan((("hello", "world"),))
        with patch.object(
                audio_tts, "_render_session",
                return_value=(b"pcm", "request-one")) as render, \
                patch.object(
                    audio_tts.audio_codec, "encode_pcm",
                    return_value=b"mp3") as encode:
            result = audio_tts.synthesize(planned, options())
        audio, failures, _transcripts, _usage, request_ids, diagnostics = result
        self.assertEqual(audio, b"mp3")
        self.assertEqual(failures, [])
        self.assertEqual(request_ids, ["request-one"])
        render.assert_called_once_with(("hello", "world"), options())
        encode.assert_called_once()
        self.assertEqual(diagnostics[0]["submissions"], 2)

    def test_transient_session_failure_retries_without_partial_output(self):
        planned = audio_tts.AudioPlan((("hello",),))
        with patch.object(
                audio_tts, "_render_session",
                side_effect=[RuntimeError("timeout"), (b"pcm", "request")]
                ) as render, \
                patch.object(audio_tts.time, "sleep"), \
                patch.object(audio_tts.audio_codec, "encode_pcm",
                             return_value=b"mp3"):
            audio, failures, *_ = audio_tts.synthesize(planned, options())
        self.assertEqual(audio, b"mp3")
        self.assertEqual(failures, [])
        self.assertEqual(render.call_count, 2)

    def test_failed_later_session_discards_all_earlier_audio(self):
        planned = audio_tts.AudioPlan((("first",), ("second",)))
        with patch.object(
                audio_tts, "_render_session",
                side_effect=[(b"first-pcm", "one"), RuntimeError("timeout")]), \
                patch.object(audio_tts.time, "sleep"), \
                patch.object(audio_tts.audio_codec, "encode_pcm") as encode:
            audio, failures, *_ = audio_tts.synthesize(
                planned, options(), retries=1)
        self.assertEqual(audio, b"")
        self.assertEqual(failures[0].index, 2)
        encode.assert_not_called()

    def test_fatal_failure_is_not_retried(self):
        planned = audio_tts.AudioPlan((("hello",),))
        with patch.object(
                audio_tts, "_render_session",
                side_effect=RuntimeError("InvalidApiKey: bad key")) as render, \
                patch.object(audio_tts.time, "sleep") as sleep:
            audio, failures, *_ = audio_tts.synthesize(planned, options())
        self.assertEqual(audio, b"")
        self.assertEqual(len(failures), 1)
        self.assertEqual(render.call_count, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
