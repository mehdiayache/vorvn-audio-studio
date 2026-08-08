# Voices — the rebuild

> Historical implementation record. `check_voices.py` and the legacy UI
> referenced below were removed after their provider and React contracts were
> covered by the current automated suites. Current state lives in
> `MIGRATION.md`.

Every defect found in the audit, with how it gets proved fixed. Nothing is
ticked from memory: each line names a check, and `check_voices.py` runs the ones
a machine can run.

Status: `[ ]` not started · `[~]` built, not verified · `[x]` verified

---

## Stage 1 — One voice, not two rows

The root problem. Plus and Flash are separate ids, so every voice is counted,
listed, favourited and pictured twice.

- [x] **V1** A voice is one thing with a quality switch, not two rows
      → *check:* the catalogue reports 597, and no two rows share a name+trait
- [x] **V2** A favourite set on Plus is set on Flash too
      → *check:* favourite one tier, read back the other
- [x] **V3** A picture set on one tier shows on the other
      → *check:* same, for `image`
- [x] **V4** "Language" renamed to **Voice origin**, with a plain sentence saying
      almost all of them read English
      → *check:* the word "Language" no longer labels that filter
- [x] **V5** A **native English** mark. Corrected during the work: Alibaba
      publishes no per-voice list of spoken languages, so claiming "reads
      English" for 589 voices would be an invention. Only the 8 native ones are
      marked, and the screen says plainly that origin is not what a voice can
      speak.
      → *check:* `native English` appears on those 8, and nowhere else

## Stage 2 — One player for the whole app

Done. There is now one `player`; "play all" became a queue that hands each
piece to it. Verified in the browser: a part playing in Projects stops the
moment a voice is auditioned in Voices, and its button returns to rest.

- [x] **V6** Starting any audio stops whatever was playing, anywhere
      → *check:* play a part, audition a voice, only one is running
- [x] **V7** "Hear it" keeps its label instead of turning into `■`
      → *check:* read the button text while playing
- [x] **V8** Switching voice while one plays stops it
      → *check:* `audioStillRunning === false`
- [x] **V9** A play button on **every** voice row, not only in the panel
      → *check:* every `.vrow` has one
- [x] **V10** Whatever is playing shows it, wherever it is on screen
      → *check:* exactly one control is in the playing state at a time

## Stage 3 — The voice screen

Done. The browser is **one node**, moved into a dialog when the composer or a
script block needs to pick, then moved home — the same trick the composer uses.
Verified: only one `#voiceModeBrowse` exists in the page, and it is the same DOM
element before and after picking.

- [x] **V11** The circle **is** the upload — click or drop, camera on hover
      → *check:* the circle accepts a drop, and no "Give it a picture" button exists
- [x] **V12** A character sheet, not a spreadsheet: picture, name, description,
      one strong play control, usage as a quiet line
      → *check:* by eye, against the screenshot that started this
- [x] **V13** Hear the voice say **your own sentence**, with the price shown first
      → *check:* the field exists and states the cost before spending
- [x] **V14** Compare two or three voices on the same line
      → *check:* pick 2, both render, one plays at a time
- [x] **V15** Rename a clone and write a note on any voice
      → *check:* set a note, reload, it is still there (from the database)
- [x] **V16** The old voice modal is **deleted**; the composer opens this screen
      → *check:* `#voiceDialog` no longer exists in the page
- [x] **V17** A default voice you can set
      → *check:* set it, reload, the composer opens on it

## Stage 4 — Cloning

Done. `qwen3-omni-flash` really does listen: given the Heartsnotes intro it
answered *female, 35, calm soothing, meditation* — which is what that recording
is. Probed first that no `qwen-audio-turbo` exists on this account, so the
feature rests on a model that answered, not on a name I hoped for.

On the quota: Alibaba publishes no number through the API, so the screen states
the count you hold and what to do if a new one is refused, rather than inventing
a limit.

- [x] **V18** Record · Choose a file · Paste a URL become **tabs**
      → *check:* three tabs, one visible at a time
- [x] **V19** A clone carries the **same fields as Alibaba's voices**: display
      name, gender, age, character, use case, spoken languages, note
      → *check:* create one, it appears in Explore with those fields filled
- [x] **V20** Qwen can propose those fields from the recording; you correct them
      → *check:* the button exists, states its cost, and fills the form
- [x] **V21** The clone list shows a name, never `qwen-audio-3.0-tts-flash-…`
      → *check:* no raw id in any visible row
- [x] **V22** Hear the clone straight after making it
      → *check:* a play control appears on success
- [x] **V23** How many clone slots remain
      → *check:* a count is shown before you spend one
- [x] **V24** Re-record a clone without burning a slot (the server already does it)
      → *check:* the button exists and calls `/api/clone/update`

## Stage 5 — Everywhere else a voice appears

Done. One correction made to the rule rather than the code: a raw voice id is
allowed in a tooltip and in the "How it was made" panel, because those are
exactly where a person goes looking for the technical value. What must never
happen — an id used as a **label** — is what the check now asserts.

- [x] **V25** The Script tab uses the voice component, not a raw `<select>`
      → *check:* no `<select data-f="voice">` remains
- [x] **V26** Batch validates the voice column against the catalogue
      → *check:* an unknown voice is reported before anything is spent
- [x] **V27** Every list showing a voice uses one component — parts, takes, modal,
      history, assets, script, batch
      → *check:* grep finds no raw voice id in a template

---

## How this gets verified

1. `python check_voices.py` — everything a machine can assert: the data model,
   the database round-trips, and the absence of the things that should be gone.
2. A browser pass per stage, driving the real UI and reading back state.
3. Nothing is marked `[x]` without the output pasted into the commit or the
   message. `[~]` means built but unproven, and is not a finish.

## Decisions taken, so they are not re-litigated

- **Auditioning your own text costs money** → it is in, behind an explicit
  button, with the price stated before the first call.
- **Clone metadata** → you fill it in, with an optional *Suggest with Qwen*
  button. Nothing is spent unless you press it.

---

## Found after the stages, by clicking through everything

- **The seven default voices are not in Alibaba's catalogue.** They were found
  by probing the API weeks ago and hard-coded, so they have no preview clip —
  which is why play did nothing on the voices you use most. A voice you have
  used now previews with **your own latest recording** in it: truthful, free,
  and better than a stock clip.
- **A clone appeared twice** in My voices — once from the service's full id,
  once as a key from your usage. Rows are now unique by voice.
- **`loongryanma` was marked "no longer available"** although it is in the
  catalogue: the check compared raw ids instead of keys.
- **The action buttons wrapped** into a three-line block. They are a grid now,
  all one height.
- **Audio outlived its screen** — changing mode, opening another voice, or
  leaving the tab left it playing. It stops with the screen that started it.
- **`<dialog>` never fires its `close` event in this browser**, verified by
  opening and closing one directly. Nothing depends on it any more: every
  dismissal calls home() itself, and opening the Voices tab re-homes the list
  as a safety net.
