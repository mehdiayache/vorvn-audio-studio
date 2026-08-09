#!/usr/bin/env python3
"""
Tests for the native Audio TTS adapter's chunking and retry behaviour.

Every model call is mocked — running this never touches the API and never costs
anything. Run with:  .venv/bin/python test_audio_tts.py
"""

import sys
import types

from audio_studio.domain import speech_text
from audio_studio.infrastructure.alibaba import audio_tts


class FakeArgs(types.SimpleNamespace):
    def __init__(self, **kw):
        super().__init__(model="plus", voice="v", format="mp3", rate=1.0, pitch=1.0,
                         volume=50, instruction=None, language=None, seed=0, **kw)


def patch_render(behaviours):
    """Replace the network call with a scripted sequence per chunk text.

    behaviours maps chunk text -> list of outcomes, consumed one per attempt.
    An outcome is either bytes (success) or an Exception instance (failure).
    """
    calls = []

    def fake(text, args):
        calls.append(text)
        outcome = behaviours[text].pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    audio_tts._render_chunk = fake
    audio_tts.time.sleep = lambda _: None  # don't actually wait out the backoff
    return calls


results = []


def check(name, condition, detail=""):
    results.append((name, condition, detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not condition else ""))


print("chunking")
check("splits long text under the limit",
      all(len(c) <= 500 for c in speech_text.chunk_text("This is a sentence. " * 200)))
check("keeps every word", "".join(speech_text.chunk_text("One. Two. Three.")).replace(" ", "")
      == "One.Two.Three.".replace(" ", ""))
check("empty text yields nothing", speech_text.chunk_text("   ") == [])
check("hard-splits a sentence with no punctuation",
      all(len(c) <= 500 for c in speech_text.chunk_text("word " * 400)))

print("\nretry")
patch_render({"a": [b"AAA"], "b": [b"BBB"]})
audio, failures = audio_tts.synthesize(["a", "b"], FakeArgs())
check("clean run joins audio in order", audio == b"AAABBB", audio)
check("clean run reports no failures", failures == [])

calls = patch_render({"a": [b"AAA"], "b": [RuntimeError("timeout"), b"BBB"]})
audio, failures = audio_tts.synthesize(["a", "b"], FakeArgs())
check("transient failure is retried and succeeds", audio == b"AAABBB", audio)
check("retry leaves no failure recorded", failures == [])
check("the failing chunk was attempted twice", calls.count("b") == 2, calls)

calls = patch_render({
    "a": [b"AAA"],
    "b": [RuntimeError("timeout")] * 3,
    "c": [b"CCC"],
})
audio, failures = audio_tts.synthesize(["a", "b", "c"], FakeArgs())
check("a permanently failing chunk is skipped, rest kept", audio == b"AAACCC", audio)
check("the skipped chunk is reported", len(failures) == 1 and failures[0].index == 2,
      failures)
check("it retried the full budget", calls.count("b") == audio_tts.RETRIES, calls)

print("\nfatal errors")
patch_render({"a": [RuntimeError("InvalidApiKey: apikey is required")]})
try:
    audio_tts.synthesize(["a"], FakeArgs())
    check("fatal error on first chunk raises", False, "no exception raised")
except RuntimeError as exc:
    check("fatal error on first chunk raises", True)
    check("the message names the likely cause", "API key" in str(exc), str(exc))

calls = patch_render({"a": [b"AAA"], "b": [RuntimeError("InvalidApiKey: bad key")]})
audio, failures = audio_tts.synthesize(["a", "b"], FakeArgs())
check("fatal error mid-run salvages earlier audio", audio == b"AAA", audio)
check("fatal error is not retried", calls.count("b") == 1, calls)
check("fatal error is still reported", len(failures) == 1)

print("\nprogress callback")
seen = []
patch_render({"a": [b"A"], "b": [b"B"]})
audio_tts.synthesize(["a", "b"], FakeArgs(), on_progress=lambda i, n, t: seen.append((i, n)))
check("progress fires once per chunk", seen == [(1, 2), (2, 2)], seen)

failed = [name for name, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if __name__ == "__main__":
    sys.exit(1 if failed else 0)
