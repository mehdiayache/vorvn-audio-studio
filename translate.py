#!/usr/bin/env python3
"""
Translation, used for subtitles in another language and for speaking a script
in one.

Subtitles are the awkward case: each line has a timing that must survive
translation, so lines can't simply be concatenated and translated as prose.
They're sent as a numbered batch instead — the model keeps sentence context,
and the numbering lets each translated line go back to its original timing.
"""

import re

# The dedicated translation models. Flash is the current cheap default; plus is better
# on idiom and worth it for anything published.
MODELS = {"fast": "qwen-mt-flash", "best": "qwen-mt-plus"}

# Everything the translator handles. Subtitles can use all of these, because
# they're only ever read.
LANGUAGES = [
    "English", "Chinese", "Japanese", "Korean", "French", "German", "Spanish",
    "Italian", "Portuguese", "Russian", "Arabic", "Indonesian", "Malay",
    "Thai", "Vietnamese", "Tagalog", "Dutch", "Turkish", "Polish", "Hindi",
]

# The subset the speech model can actually say. Offering the others for audio
# would translate fine and then produce nonsense, so they're kept apart.
SPEAKABLE = [
    "English", "Chinese", "Japanese", "Korean", "French", "German", "Spanish",
    "Italian", "Portuguese", "Russian", "Arabic", "Indonesian", "Malay",
    "Thai", "Vietnamese", "Tagalog",
]

# Speech is now routed by capability: Arabic and other extended languages go
# through Qwen 3.5 Omni instead of being sent to an incompatible Audio voice.
UNRELIABLE_SPEECH = {}

# Long batches drift and time out; small ones lose context. This is a workable
# middle for subtitle lines.
BATCH = 40


def _call(model: str, text: str, source: str | None, target: str) -> str:
    from services.alibaba import text as alibaba_text

    options = {"source_lang": source or "auto", "target_lang": target}
    return alibaba_text.complete(
        model=MODELS.get(model, MODELS["fast"]),
        messages=[{"role": "user", "content": text}],
        extra_body={"translation_options": options},
    )


def translate_text(text: str, target: str, source: str | None = None,
                   model: str = "fast") -> str:
    """Translate a block of prose, leaving any delivery tags alone.

    A translator has no idea `[sad]` is an instruction — it dutifully returned
    `[sedih]` in Indonesian and `[حزين]` in Arabic, and the speech model does
    not know those. The whole tagging pass silently evaporated on translation.
    So the tags are taken out, the words are translated, and the tags go back.
    """
    if not text.strip():
        return ""

    import say

    # The text is cut where the tags are. Odd pieces are tags, even pieces are
    # words — so the tags never reach the translator at all.
    pieces = say.TAG_RE.split(text)
    if len(pieces) == 1:
        return _call(model, text, source, target)

    # Only the words are sent, and as a numbered batch so the model still sees
    # them together and keeps the thread of the sentence.
    words = [pieces[i] for i in range(0, len(pieces), 2)]
    sendable = [i for i, w in enumerate(words) if w.strip()]
    if sendable:
        done = translate_lines([words[i] for i in sendable],
                               target, source, model)
        for i, line in zip(sendable, done):
            # Whatever spacing surrounded the fragment is kept, or a tag and
            # the words after it would end up glued together.
            words[i] = _respace(words[i], line)

    out = []
    for index, piece in enumerate(pieces):
        out.append(f"[{piece}]" if index % 2 else words[index // 2])
    return "".join(out)


def _respace(original: str, translated: str) -> str:
    """Put back the spaces that surrounded a fragment before it was sent."""
    lead = original[:len(original) - len(original.lstrip())]
    trail = original[len(original.rstrip()):]
    return lead + translated.strip() + trail


def translate_lines(lines: list, target: str, source: str | None = None,
                    model: str = "fast", on_progress=None) -> list:
    """Translate a list of lines, returning exactly as many lines back.

    Alignment matters more than elegance here: if line 7 goes missing, every
    subtitle after it shows the wrong words. Batches that come back the wrong
    length are retried one line at a time rather than silently misaligned.

    Delivery tags are held back from the translator for the same reason as in
    translate_text, and put back in front of their line afterwards.
    """
    import say

    held = [say.TAG_RE.findall(line or "") for line in lines]
    bare = [say.TAG_RE.sub("", line or "").strip() for line in lines]

    # A line that is only a tag, or only silence, has nothing to translate.
    # Sending it would waste a slot in the batch and invite a junk reply.
    sendable = [i for i, line in enumerate(bare) if line]
    payload = [bare[i] for i in sendable]

    results: list = []
    for start in range(0, len(payload), BATCH):
        batch = payload[start:start + BATCH]
        if on_progress:
            on_progress(start, len(payload))

        numbered = "\n".join(f"{i + 1}. {line}" for i, line in enumerate(batch))
        reply = _call(model, numbered, source, target)
        parsed = _unnumber(reply, len(batch))

        if parsed is None:
            # Fall back to one call per line — slower, but never misaligned.
            parsed = [_call(model, line, source, target) for line in batch]
        results.extend(parsed)

    # Back to one result per line given, in the order they came in.
    done = dict(zip(sendable, results))
    return [" ".join(p for p in ("".join(f"[{t}]" for t in held[i]),
                                 done.get(i, "")) if p)
            for i in range(len(lines))]


def _unnumber(reply: str, expected: int) -> list | None:
    """Pull numbered lines back out, or None if the shape doesn't match."""
    found = {}
    for line in reply.splitlines():
        match = re.match(r"\s*(\d+)\s*[.)、]\s*(.*)", line)
        if match:
            found[int(match.group(1))] = match.group(2).strip()
    if len(found) != expected or set(found) != set(range(1, expected + 1)):
        return None
    return [found[i + 1] for i in range(expected)]
