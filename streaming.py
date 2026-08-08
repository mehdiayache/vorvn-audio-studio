#!/usr/bin/env python3
"""
Streaming synthesis over the realtime WebSocket API.

The normal path waits for the whole render before you hear anything. This one
starts producing audio in roughly 100ms, so a long script begins playing while
the rest is still being made.

The model emits raw PCM; browsers won't play a growing PCM stream, so it's piped
through ffmpeg into MP3 and sent to the page as a chunked HTTP response, which
an <audio> element plays progressively.

`pcm_chunks` is the only part that talks to Alibaba, so tests substitute a plain
generator and exercise everything else without spending anything.
"""

import base64
import queue
import shutil
import subprocess
import threading

SAMPLE_RATE = 24000
MODEL = "qwen-audio-3.0-tts-flash"   # only the flash tier is built for realtime


def available() -> str | None:
    """Return None when streaming can run, else why it can't."""
    if not shutil.which("ffmpeg"):
        return ("Streaming needs ffmpeg to convert the audio as it arrives. "
                "Install it with: brew install ffmpeg")
    return None


def pcm_chunks(text: str, voice: str, instruction=None, language=None,
               rate=1.0, pitch=1.0, volume=50):
    """Yield raw PCM as the model produces it."""
    from dashscope.audio.qwen_tts_realtime import (
        AudioFormat, QwenTtsRealtime, QwenTtsRealtimeCallback,
    )

    audio_queue: queue.Queue = queue.Queue()
    finished = threading.Event()

    class Callback(QwenTtsRealtimeCallback):
        def on_open(self):
            pass

        def on_close(self, code, message):
            finished.set()
            audio_queue.put(None)

        def on_event(self, response):
            kind = response.get("type", "")
            if kind == "response.audio.delta":
                audio_queue.put(base64.b64decode(response["delta"]))
            elif kind in ("response.done", "session.finished"):
                audio_queue.put(None)
            elif kind == "response.error" or "error" in kind:
                audio_queue.put(RuntimeError(str(response)))

    session = QwenTtsRealtime(model=MODEL, callback=Callback())
    session.connect()
    session.update_session(
        voice=voice,
        # The SDK offers exactly one format; a string here is silently invalid
        # and the session produces nothing at all.
        response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
        sample_rate=SAMPLE_RATE,
        volume=volume,
        speech_rate=rate,
        pitch_rate=pitch,
        language_type=language or None,
        instructions=instruction or None,
        # Numbers, dates and currency read as words — same reason as the
        # non-streaming path, where it was confirmed by ear.
        enable_tn=True,
    )
    session.append_text(text)
    session.finish()

    try:
        while True:
            item = audio_queue.get(timeout=60)
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    finally:
        try:
            session.close()
        except Exception:
            pass


def to_mp3(chunks) -> "subprocess.Popen":
    """Start ffmpeg converting a PCM stream to MP3 on the fly."""
    process = subprocess.Popen(
        ["ffmpeg", "-nostdin", "-loglevel", "error",
         "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
         "-f", "mp3", "-b:a", "128k", "pipe:1"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    )

    def feed():
        try:
            for chunk in chunks:
                process.stdin.write(chunk)
            process.stdin.flush()
        except Exception:
            pass          # the reader side reports the failure
        finally:
            try:
                process.stdin.close()
            except Exception:
                pass

    threading.Thread(target=feed, daemon=True).start()
    return process


def mp3_stream(chunks, block: int = 4096):
    """Yield MP3 bytes as they become available."""
    process = to_mp3(chunks)
    try:
        while True:
            data = process.stdout.read(block)
            if not data:
                break
            yield data
    finally:
        process.stdout.close()
        process.wait(timeout=10)
