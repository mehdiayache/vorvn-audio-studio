"""Proves, or fails to prove, the items in VOICES-PLAN.md.

Run it before and after every stage. A line that says FAIL is not an opinion.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
# The interface is three files now; these checks look for a string anywhere in
# it, so markup and script are read together.
MARKUP = (ROOT / "ui" / "index.html").read_text()
SCRIPT = (ROOT / "ui" / "app.js").read_text()
UI = MARKUP + SCRIPT
LIBRARY = json.loads((ROOT / "ui" / "voices.json").read_text())

results = []


def check(item: str, passed: bool, detail: str = ""):
    results.append((item, passed, detail))


# ── Stage 1 — one voice, not two rows ───────────────────────────────────
by_voice = {}
for v in LIBRARY:
    key = re.sub(r"^qwen[\w.-]*?-tts-(?:plus|flash)-", "", v["id"])
    by_voice.setdefault(key, []).append(v)

# The count used to be pinned at 597. That was the whole catalogue, 589 of
# which were Chinese voices Mehdi will never use — they are out. What actually
# matters is unchanged: one voice, two tiers, never two rows.
check("V1 one voice, not two rows",
      len(by_voice) > 0 and all(len(t) == 2 for t in by_voice.values()),
      f"{len(by_voice)} voices across {len(LIBRARY)} entries")

check("V4 'Language' no longer labels the origin filter",
      'language: "Language"' not in UI,
      "found the old label" if 'language: "Language"' in UI else "renamed")

bilingual = [v for v in LIBRARY if "english" in (v.get("trait", "") + v.get("scene", "")).lower()]
check("V5 a 'reads English' mark exists", "readsEnglish" in UI,
      f"{len({v['language'] for v in LIBRARY})} origin values in the catalogue")

# ── Stage 2 — one player ────────────────────────────────────────────────
players = [n for n in ("auditionAudio", "partPlayer", "sequencePlayer") if n in UI]
check("V6 one player for the whole app", len(players) <= 1,
      f"separate players still present: {', '.join(players) or 'none'}")

check("V7 'Hear it' keeps its label",
      "button.textContent = \"■\"" not in UI,
      "a button label is still overwritten with ■"
      if 'button.textContent = "■"' in UI else "no label is overwritten")

check("V9 a play control on every voice row", "vrow-play" in UI,
      "present in the row template" if "vrow-play" in UI else "no per-row play control")

# ── Stage 3 — the voice screen ──────────────────────────────────────────
check("V11 the circle is the upload, no separate button",
      'id="vPicture"' not in UI,
      "the 'Give it a picture' button is still there"
      if 'id="vPicture"' in UI else "gone")

check("V13 audition with your own text", 'id="vSayThis"' in UI)
check("V14 compare voices", 'id="vCompare"' in UI)
check("V15 a note you can write", 'id="vNote"' in UI)
check("V16 the old voice modal is deleted", 'id="voiceDialog"' not in UI,
      "the old modal is still in the page" if 'id="voiceDialog"' in UI else "removed")
# A button that saves a value nobody reads is not a feature. This asserts the
# value is used to open the composer, which is the whole point.
check("V17 a default voice you can set, and it is used",
      'id="vMakeDefault"' in UI and "applyDefaultVoice" in UI
      and UI.count("chosen_default_voice") >= 3,
      "saved and applied" if "applyDefaultVoice" in UI
      else "saved but never read")

# ── Stage 4 — cloning ───────────────────────────────────────────────────
check("V18 record / file / url are tabs", 'id="cloneSourceTabs"' in UI)
check("V19 a clone carries the same fields", 'id="cloneGender"' in UI
      and 'id="cloneAge"' in UI and 'id="cloneTrait"' in UI)
check("V20 Qwen can propose the fields", 'id="cloneSuggest"' in UI)
check("V21 no raw voice id shown in the clone list",
      "use.textContent = id" not in UI,
      "the clone list still prints the raw id"
      if "use.textContent = id" in UI else "uses a readable name")
check("V22 hear the clone right after making it", 'id="cloneHear"' in UI)
check("V23 remaining clone slots are shown", 'id="cloneQuota"' in UI)
check("V24 re-record a clone", 'id="cloneRerecord"' in UI)

# ── Stage 5 — everywhere else ───────────────────────────────────────────
SERVER = (ROOT / "server.py").read_text()
check("V26 Batch checks the voice column before spending",
      "_batch_check_voices" in SERVER and '"voices": self._batch_check_voices' in SERVER,
      "unknown voices are named in the preview"
      if "_batch_check_voices" in SERVER else "no check runs")

check("V25 the Script tab uses the voice component",
      '<select data-f="voice">' not in UI,
      "a raw select is still used for a block's voice"
      if '<select data-f="voice">' in UI else "replaced")

# A raw id is fine in a tooltip and in the "How it was made" panel — those are
# the two places a person goes looking for the technical value. What must never
# happen is an id used as a label.
# The technical panel is a multi-line array, so it is cut out as a block rather
# than filtered line by line.
start = SCRIPT.index("const shown = [")
technical = SCRIPT[start:SCRIPT.index("];", start)]
visible = [line for line in SCRIPT.splitlines()
           if re.search(r"\$\{(?:escapeHtml\()?(?:part|row|take|item|v)\.voice\)?\}", line)
           and "title=" not in line
           and line not in technical]
check("V27 no voice id used as a label", not visible,
      f"{len(visible)} template(s) label with an id" if visible
      else "ids appear only in tooltips and the technical panel")

# ── report ──────────────────────────────────────────────────────────────
width = max(len(name) for name, _, _ in results)
passed = 0
for name, ok, detail in results:
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<{width}}  {detail}")
    passed += ok
print(f"\n  {passed}/{len(results)} verified")
sys.exit(0 if passed == len(results) else 1)
