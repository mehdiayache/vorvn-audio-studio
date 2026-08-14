"""Alibaba asynchronous Qwen3-ASR and compatible Fun-ASR adapter."""

from __future__ import annotations

import json
import os
import urllib.request

import dashscope

from audio_studio.domain.transcription import (
    FUN_MODEL,
    ProviderTranscript,
    QWEN_MODEL,
)
from audio_studio.providers.alibaba import config


LANGUAGE_CODES = {
    "English": "en", "Chinese": "zh", "Japanese": "ja", "Korean": "ko",
    "French": "fr", "German": "de", "Spanish": "es", "Italian": "it",
    "Portuguese": "pt", "Russian": "ru", "Arabic": "ar",
    "Indonesian": "id", "Malay": "ms", "Thai": "th",
    "Vietnamese": "vi", "Tagalog": "fil",
}

LANGUAGE_NAMES = {code: name for name, code in LANGUAGE_CODES.items()}
LANGUAGE_NAMES.update({
    "yue": "Cantonese", "hi": "Hindi", "tr": "Turkish",
    "uk": "Ukrainian", "cs": "Czech", "da": "Danish",
    "fi": "Finnish", "is": "Icelandic", "no": "Norwegian",
    "pl": "Polish", "sv": "Swedish",
})


def parse(payload: dict) -> dict:
    sentences = []
    language_duration: dict[str, int] = {}
    for transcript in payload.get("transcripts", []):
        for sentence in transcript.get("sentences", []):
            code = str(sentence.get("language") or "").strip().lower()
            if code:
                duration = max(
                    int(sentence.get("end_time", 0))
                    - int(sentence.get("begin_time", 0)),
                    1,
                )
                language_duration[code] = language_duration.get(code, 0) + duration
            sentences.append({
                "start": int(sentence.get("begin_time", 0)),
                "end": int(sentence.get("end_time", 0)),
                "text": (sentence.get("text") or "").strip(),
                "words": [{
                    "start": int(word.get("begin_time", 0)),
                    "end": int(word.get("end_time", 0)),
                    "text": ((word.get("text") or "").strip()
                             + (word.get("punctuation") or "").strip()),
                } for word in sentence.get("words", [])],
            })
    sentences = [sentence for sentence in sentences if sentence["text"]]
    detected_code = (sorted(
        language_duration.items(), key=lambda item: (-item[1], item[0]))[0][0]
        if language_duration else None)
    return {
        "text": " ".join(sentence["text"] for sentence in sentences),
        "sentences": sentences,
        "duration_ms": max((sentence["end"] for sentence in sentences), default=0),
        "language": LANGUAGE_NAMES.get(detected_code, detected_code),
    }


def _output(response) -> dict:
    value = getattr(response, "output", None) or {}
    return dict(value) if not isinstance(value, dict) else value


def _task_id(response) -> str:
    output = _output(response)
    task_id = output.get("task_id") or getattr(
        getattr(response, "output", None), "task_id", None)
    if not task_id:
        raise RuntimeError(
            "Alibaba accepted the request but returned no transcription task ID.")
    return str(task_id)


def _raise_failed(output: dict) -> None:
    if str(output.get("task_status") or "").upper() in {"FAILED", "UNKNOWN"}:
        raise RuntimeError(
            f"{output.get('message') or 'Transcription failed.'} "
            f"({output.get('code', 'no code')})")


def _raise_http(response) -> None:
    if int(getattr(response, "status_code", 0) or 0) != 200:
        output = _output(response)
        message = (getattr(response, "message", None)
                   or output.get("message") or "Transcription request failed.")
        raise RuntimeError(str(message))


def _download(url: str) -> dict:
    if not url:
        raise RuntimeError(
            "Alibaba finished transcription but returned no result URL.")
    with urllib.request.urlopen(url) as handle:
        return parse(json.load(handle))


def _usage(response) -> dict:
    value = getattr(response, "usage", None)
    if value is None and hasattr(response, "get"):
        value = response.get("usage")
    if value is None:
        value = _output(response).get("usage")
    if isinstance(value, dict):
        return dict(value)
    if value and hasattr(value, "items"):
        return dict(value.items())
    return {}


class AlibabaTranscriptionProvider:
    @property
    def region(self) -> str:
        return config.region()

    def transcribe(self, *, url: str, language: str | None, words: bool,
                   vocabulary_id: str | None,
                   enable_itn: bool) -> ProviderTranscript:
        key = os.getenv("DASHSCOPE_API_KEY")
        if not key:
            raise RuntimeError("DASHSCOPE_API_KEY is not set")
        dashscope.api_key = key
        dashscope.base_http_api_url = config.http_base()
        dashscope.base_websocket_api_url = config.websocket_base()
        code = LANGUAGE_CODES.get(language, language)
        if vocabulary_id:
            result, request_id, usage = self._fun(
                url, code, words, vocabulary_id)
        else:
            result, request_id, usage = self._qwen(
                url, code, words, enable_itn)
        billed_seconds = usage.get("seconds")
        if billed_seconds is None:
            billed_seconds = usage.get("duration")
        return ProviderTranscript(
            **result, request_id=request_id, provider_region=self.region,
            provider_endpoint=config.http_base(), usage=usage,
            billed_duration_ms=(round(float(billed_seconds) * 1000)
                                if billed_seconds is not None else None))

    @staticmethod
    def _qwen(url: str, language: str | None, words: bool,
              enable_itn: bool) -> tuple[dict, str, dict]:
        from dashscope.audio.qwen_asr import QwenTranscription

        params = {"model": QWEN_MODEL, "file_url": url,
                  "enable_itn": enable_itn, "enable_words": words}
        if language:
            params["language"] = language
        task = QwenTranscription.async_call(**params)
        _raise_http(task)
        task_id = _task_id(task)
        response = QwenTranscription.wait(task=task_id)
        _raise_http(response)
        output = _output(response)
        _raise_failed(output)
        result = _download((output.get("result") or {}).get("transcription_url") or "")
        return (result, str(getattr(response, "request_id", None) or task_id),
                _usage(response))

    @staticmethod
    def _fun(url: str, language: str | None, words: bool,
             vocabulary_id: str) -> tuple[dict, str, dict]:
        from dashscope.audio.asr import Transcription

        params = {"model": FUN_MODEL, "file_urls": [url],
                  "enable_words": words, "vocabulary_id": vocabulary_id}
        if language:
            params["language_hints"] = [language]
        task = Transcription.async_call(**params)
        _raise_http(task)
        task_id = _task_id(task)
        response = Transcription.wait(task=task_id)
        _raise_http(response)
        output = _output(response)
        _raise_failed(output)
        results = output.get("results") or []
        if not results:
            raise RuntimeError(
                f"The recogniser returned no results (status "
                f"{output.get('task_status', 'unknown')}).")
        first = results[0]
        if first.get("subtask_status") == "FAILED":
            raise RuntimeError(first.get("message") or "Transcription failed.")
        result = _download(first.get("transcription_url") or "")
        return (result, str(getattr(response, "request_id", None) or task_id),
                _usage(response))
