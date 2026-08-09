"""Route speech to the Alibaba service whose contract matches the request."""

import say

from audio_studio.infrastructure.alibaba import omni


def synthesize(chunks, options, on_progress=None):
    if options.engine == "omni":
        # Never silently discard an accepted delivery decision. Inline tags
        # belong to Qwen Audio TTS; Omni must receive an explicitly selected
        # Raw/Spoken script and a natural-language direction instead.
        if any(tag.casefold() in say.KNOWN_TAGS
               for chunk in chunks for tag in say.TAG_RE.findall(chunk)):
            raise ValueError("Qwen 3.5 Omni does not support inline delivery tags. Choose Raw or Spoken text, or use Qwen Audio TTS.")
        audio, failures, transcripts, usage = omni.synthesize(chunks, options, on_progress)
        return audio, failures, transcripts, usage
    audio, failures = say.synthesize(chunks, options, on_progress=on_progress)
    return audio, failures, [], {}
