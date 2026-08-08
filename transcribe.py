#!/usr/bin/env python3
"""
Speech to text, with timestamps — the groundwork for subtitles.

Uses qwen3-asr-flash-filetrans, which returns word-level timings. Like voice
cloning, it fetches the audio from a URL, so the file goes to your own storage
first and the service is handed a short-lived link.

Parsing is kept separate from the network call so the SRT and VTT output can be
tested against a saved response without spending anything.
"""

import json
import urllib.request

from services import captions

# This model is now published for Singapore. Keeping the identifier here makes
# the activity ledger and the network request agree.
MODEL = "qwen3-asr-flash-filetrans"

# The service wants short codes, but the rest of the app speaks in language names.
LANGUAGE_CODES = {
    "English": "en", "Chinese": "zh", "Japanese": "ja", "Korean": "ko",
    "French": "fr", "German": "de", "Spanish": "es", "Italian": "it",
    "Portuguese": "pt", "Russian": "ru", "Arabic": "ar", "Indonesian": "id",
    "Malay": "ms", "Thai": "th", "Vietnamese": "vi", "Tagalog": "fil",
}


def transcribe(url: str, language: str | None = None, words: bool = True,
               vocabulary_id: str | None = None, enable_itn: bool = False) -> dict:
    """Run a file through the recogniser and return the parsed result."""
    # Existing custom vocabularies were created for Fun-ASR and are not
    # portable to Qwen3-ASR. Use the modern recogniser by default, but keep the
    # compatible path when a vocabulary was deliberately selected.
    if vocabulary_id:
        return _transcribe_fun_asr(url, language, words, vocabulary_id)
    return _transcribe_qwen(url, language, words, enable_itn)


def _output(response) -> dict:
    """Normalize DashScope's dict-like SDK response without hiding failures."""
    value = getattr(response, "output", None) or {}
    return dict(value) if not isinstance(value, dict) else value


def _task_id(response) -> str:
    output = _output(response)
    task_id = output.get("task_id") or getattr(getattr(response, "output", None),
                                               "task_id", None)
    if not task_id:
        raise RuntimeError("Alibaba accepted the request but returned no transcription task ID.")
    return str(task_id)


def _raise_failed(output: dict) -> None:
    if str(output.get("task_status") or "").upper() in {"FAILED", "UNKNOWN"}:
        raise RuntimeError(
            f"{output.get('message') or 'Transcription failed.'} "
            f"({output.get('code', 'no code')})"
        )


def _download_result(url: str) -> dict:
    if not url:
        raise RuntimeError("Alibaba finished transcription but returned no result URL.")
    with urllib.request.urlopen(url) as handle:
        return parse(json.load(handle))


def _transcribe_qwen(url: str, language: str | None, words: bool,
                     enable_itn: bool = False) -> dict:
    """Use the current Qwen file-transcription SDK contract."""
    from dashscope.audio.qwen_asr import QwenTranscription

    params = {"model": MODEL, "file_url": url, "enable_itn": enable_itn,
              "enable_words": words}
    code = LANGUAGE_CODES.get(language, language)
    if code:
        params["language"] = code

    task = QwenTranscription.async_call(**params)
    if task.status_code != 200:
        raise RuntimeError(f"The recogniser refused the request: {task.message}")

    response = QwenTranscription.wait(task=_task_id(task))
    output = _output(response)
    _raise_failed(output)
    result = output.get("result") or {}
    return _download_result(result.get("transcription_url") or "")


def _transcribe_fun_asr(url: str, language: str | None, words: bool,
                        vocabulary_id: str) -> dict:
    """Keep legacy custom vocabularies on their compatible Fun-ASR route."""
    from dashscope.audio.asr import Transcription

    params = {"model": "fun-asr", "file_urls": [url], "enable_words": words,
              "vocabulary_id": vocabulary_id}
    code = LANGUAGE_CODES.get(language, language)
    if code:
        params["language_hints"] = [code]

    task = Transcription.async_call(**params)
    if task.status_code != 200:
        raise RuntimeError(f"The recogniser refused the request: {task.message}")

    response = Transcription.wait(task=_task_id(task))
    output = _output(response)

    # A failed job still returns HTTP 200 — the real reason is inside the
    # payload, and saying "returned nothing" instead of quoting it wasted a
    # whole debugging round.
    _raise_failed(output)

    results = output.get("results") or []
    if not results:
        raise RuntimeError(
            f"The recogniser returned no results (status "
            f"{output.get('task_status', 'unknown')})."
        )

    first = results[0]
    if first.get("subtask_status") == "FAILED":
        raise RuntimeError(first.get("message") or "Transcription failed.")

    return _download_result(first.get("transcription_url") or "")


def parse(payload: dict) -> dict:
    """Flatten the service's response into sentences, words and plain text."""
    sentences = []
    for transcript in payload.get("transcripts", []):
        for sentence in transcript.get("sentences", []):
            sentences.append({
                "start": int(sentence.get("begin_time", 0)),
                "end": int(sentence.get("end_time", 0)),
                "text": (sentence.get("text") or "").strip(),
                # Punctuation arrives in its own field. Dropping it turns a
                # split sentence into an unreadable run-on in the subtitles.
                "words": [
                    {"start": int(w.get("begin_time", 0)),
                     "end": int(w.get("end_time", 0)),
                     "text": ((w.get("text") or "").strip()
                              + (w.get("punctuation") or "").strip())}
                    for w in sentence.get("words", [])
                ],
            })
    sentences = [s for s in sentences if s["text"]]
    return {
        "text": " ".join(s["text"] for s in sentences),
        "sentences": sentences,
        "duration_ms": max((s["end"] for s in sentences), default=0),
    }


# ─────────────────────────────── subtitles ────────────────────────────────

# Compatibility facade. New layouts live in services.captions so transcription,
# Production export and the standalone subtitle UI all use the same rules.
MAX_LINE = 42
MAX_LINES = 2
MIN_CUE_MS = 800


def _timestamp(ms: int, comma: bool = True) -> str:
    return captions._timestamp(ms, comma)


def _wrap(text: str) -> str:
    return captions._wrap(text, MAX_LINE, MAX_LINES)


def _split_without_timings(text: str, start: int, end: int) -> list:
    return captions.build_cues([{"text": text, "start": start, "end": end}], "standard")


def to_cues(result: dict) -> list:
    return captions.build_cues(result, "standard")


def render_srt(cues: list) -> str:
    """Cues on a timeline become a subtitle file. Used both for one recording
    and for a whole stitched project, where cues arrive already offset."""
    return captions.render_srt(cues)


def render_vtt(cues: list) -> str:
    return captions.render_vtt(cues)


def to_srt(result: dict) -> str:
    return render_srt(to_cues(result))


def to_vtt(result: dict) -> str:
    return render_vtt(to_cues(result))
