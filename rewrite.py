"""Legacy prompt-screen facade for native text-preparation rules.

Shape and Tag execution now belongs to
``audio_studio.application.text_preparation``.  The historical settings screen
still imports this module, so it temporarily adapts its process-local API to
the same canonical prompt functions instead of keeping a second rule set.
"""

from audio_studio.application import text_preparation as native


MODEL = native.MODEL
DEFAULTS = native.DEFAULTS
DENSITIES = native.DENSITIES
estimate = native.estimate
variables = native.variables
difference = native.difference
strip_unknown = native.strip_unknown

_saved: dict = {}


def use_settings(saved: dict):
    global _saved
    _saved = {key: value for key, value in (saved or {}).items()
              if key in DEFAULTS and str(value).strip()}


def templates() -> dict:
    return native.templates(_saved)


def shape_prompt(style: str = "") -> str:
    return native.shape_prompt(style, _saved)


def tag_prompt(density: str = "normal", style: str = "") -> str:
    return native.tag_prompt(density, style, _saved)
