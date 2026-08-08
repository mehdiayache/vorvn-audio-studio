"""Turning text written for the eye into text written for the ear.

Two passes, both optional, both explicit:

* **shape** — the same meaning, rebuilt for someone listening. An AI writing
  prose produces balanced paragraphs and long clean sentences, which read well
  and sound flat. Speech wants short sentences, room to breathe, and punctuation
  that serves the lungs rather than the grammar.
* **tag** — the documented inline tags, at a density you choose.

Neither invents a tag: the model is given the exact list and anything else it
returns is stripped before you ever see it.
"""

import difflib
import json
import re

import say

MODEL = "qwen3.7-plus"

# Roughly what Qwen-Plus costs per million tokens, and about four characters to
# a token. Everything shown to a person is labelled an estimate, because it is.
IN_PER_M = 0.4
OUT_PER_M = 1.2

# The prompts are templates you can edit, not code. `{moods}`, `{sounds}` and
# `{retired}` are filled from the real tag lists at the moment of sending, so
# retiring a tag changes the instruction everywhere without anyone editing text.
DEFAULTS = {
    "shape": (
        "You rewrite text so it sounds right when spoken aloud. Keep the "
        "meaning, the language and the facts exactly. Change only how it is "
        "built for a listener:\n"
        "- shorter sentences; break long ones\n"
        "- punctuation that gives the reader room to breathe, including "
        "ellipses where a pause helps\n"
        "- no headings, no bullet symbols, no markdown, no parentheses read "
        "aloud as clutter\n"
        "- spell out anything a reader would stumble over\n"
        "- do not add new information, do not summarise, do not add tags\n"
        "Reply with the rewritten text only, nothing else."
    ),
    "tag": (
        "You add inline delivery tags to text that is about to be spoken by a "
        "text-to-speech model.\n"
        "MOOD tags set a delivery that holds until the next mood tag: {moods}\n"
        "SOUND tags make one effect then return to normal: {sounds}\n"
        "Never use any other tag, including {retired}.\n"
        "Rules: use ONLY tags from those two lists, exactly as written. Never "
        "invent a tag. Never change, add or remove any of the words. Place a "
        "tag immediately before the words it applies to.\n"
        "{density}\n"
        "Reply with the tagged text only, nothing else."
    ),
    "style_line": "The voice of this work, in the owner's words: {style}",
    "density_none": "Do not add any tags at all.",
    "density_light": "Add very few tags — only where one clearly helps, at most "
                     "one every few sentences.",
    "density_normal": "Add tags where they genuinely help the delivery.",
    "density_heavy": "Add tags generously, several per paragraph, wherever a "
                     "shift in delivery would make it more alive.",
}

DENSITIES = ("none", "light", "normal", "heavy")

# Set by the server from the database, so nothing here reaches for storage.
_saved = {}


def use_settings(saved: dict):
    """Whatever the person has edited, over the defaults."""
    global _saved
    _saved = {k: v for k, v in (saved or {}).items()
              if k in DEFAULTS and str(v).strip()}


def templates() -> dict:
    """The templates in force: the defaults, with any edits on top."""
    return {**DEFAULTS, **_saved}


def variables() -> dict:
    """What the placeholders are worth right now."""
    return {
        "moods": ", ".join(f"[{t}]" for t in say.MOOD_TAGS),
        "sounds": ", ".join(f"[{t}]" for t in say.SOUND_TAGS),
        "retired": ", ".join(f"[{t}]" for t in say.RETIRED_TAGS) or "none",
    }


def _fill(template: str, extra: dict = None) -> str:


    """Replace {moods}, {sounds} and the rest with what they are worth now."""
    values = {**variables(), **(extra or {})}
    text = template or ""
    for key, value in values.items():
        text = text.replace("{" + key + "}", str(value))
    return text


def estimate(text: str) -> float:
    """What a pass over this text costs, near enough to warn on."""
    tokens = max(1, len(text) / 4)
    return round((tokens * IN_PER_M + tokens * OUT_PER_M) / 1_000_000, 5)


def _ask(prompt: str, text: str) -> str:


    """Send one prompt and one text to the model, and return its answer."""
    from services.alibaba import text as alibaba_text
    return alibaba_text.complete(
        model=MODEL,
        messages=[{"role": "system", "content": prompt},
                  {"role": "user", "content": text}],
    )


def _with_style(prompt: str, style: str) -> str:


    """Append the venture's own description of how it should sound."""
    if not style:
        return prompt
    return prompt + "\n\n" + _fill(templates()["style_line"], {"style": style})


def shape_prompt(style: str = "") -> str:
    """The instruction sent for a shaping pass — the same string the screen
    shows you, built by the same function that sends it."""
    return _with_style(_fill(templates()["shape"]), style)


def shape(text: str, style: str = "") -> str:
    """Rewrite for the ear. Same meaning, same language, spoken rhythm."""
    return _ask(shape_prompt(style), text)


def tag_prompt(density: str = "normal", style: str = "") -> str:


    """The instruction sent for a tagging pass — the same string the screen


    shows you, built by the same function that sends it."""
    kept = templates()
    line = kept.get(f"density_{density}") or kept["density_normal"]
    return _with_style(_fill(kept["tag"], {"density": line}), style)


def tag(text: str, density: str = "normal", style: str = "") -> str:
    """Put documented inline tags into the text, at the chosen density."""
    return strip_unknown(_ask(tag_prompt(density, style), text))


def strip_unknown(text: str) -> str:
    """Remove any tag the service does not document.

    The model is told the list, but a made-up tag would be read out loud, so it
    is taken out here rather than trusted not to appear.
    """
    # Retired tags stay readable in text that already has them, but the model
    # is never allowed to add one.
    known = {t.lower() for t in say.KNOWN_TAGS}
    cleaned = say.TAG_RE.sub(
        lambda m: m.group(0) if m.group(1).lower() in known else "", text)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def difference(before: str, after: str) -> list:
    """Word-level marks, so a person can see what changed before accepting.

    Returned as a flat list of {kind, text} where kind is same / added / removed.
    """
    split = lambda s: re.findall(r"\S+\s*", s or "")
    old, new = split(before), split(after)
    marks = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, old, new).get_opcodes():
        if op == "equal":
            marks.append({"kind": "same", "text": "".join(new[j1:j2])})
        else:
            if i1 != i2:
                marks.append({"kind": "removed", "text": "".join(old[i1:i2])})
            if j1 != j2:
                marks.append({"kind": "added", "text": "".join(new[j1:j2])})
    return marks
