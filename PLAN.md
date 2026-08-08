# Text states · Music · Cleanup

Same discipline as the voices rebuild: every item names how it gets proved, and
`check_app.py` runs the ones a machine can run. Nothing is ticked from memory.

Status: `[ ]` not started · `[~]` built, not verified · `[x]` verified

---

## A — A text passes through states before it is spoken

Done. Proved on a real screen-written paragraph: it came back as short spoken
lines with breathing punctuation, second person, no parentheses — and the
Heartsnotes style was applied because the folder sits under that venture.
Tag density measured: light produced 0 tags on a six-sentence text, heavy
produced 6, and every one was in the documented list.

Two check assertions were wrong and were corrected rather than the code: the UI
builds its URL as `/api/text/${kind}`, and the server reaches the style through
`db.style_for` instead of naming the column.

A script arrives written for the eye. It has to become something for the ear,
then optionally get tags, and only then become audio. Each state is **kept**, so
nothing is a one-way door.

- [x] **T1** A part stores its raw, shaped and tagged text — all three
      → *check:* set all three, reload, all three come back from the database
- [x] **T2** The composer's text area has tabs: **Raw · Shaped · Tagged**
      → *check:* three tabs, switching shows different text, edits are kept
- [x] **T3** *Make it speakable* — Qwen rewrites for the ear, not the screen
      → *check:* a long screen-written paragraph comes back with shorter
        sentences and breath punctuation
- [x] **T4** What the model changed is **shown**, not swapped in silently
      → *check:* additions and removals are marked, and it can be rejected
- [x] **T5** *Add tags* with a density — none / light / normal / heavy — using
      only the 31 documented tags
      → *check:* a heavy pass yields more tags than a light one, and every tag
        it inserts is in the documented list
- [x] **T6** The venture owns its style, inherited by every pass in it
      → *check:* set a style on Heartsnotes, it reaches a pass in a folder below
- [x] **T7** Every pass states its cost before running
      → *check:* the price appears before the first call
- [x] **T8** Go back to any earlier state
      → *check:* revert from tagged to raw, the words return unchanged

## B — A folder can have music under it

Done. Not a DAW. One bed, four controls, and the mix happens at stitch.

Measured, not assumed:
* A 12 s bed covered a 72.6 s folder — looped on input, trimmed to the voice.
* **`amix` was halving the voice.** A stitched part measured 6 dB below the
  file it came from, purely for adding quiet music. `normalize=0` fixed it: the
  voice now measures −29.8 dB against −29.9 dB on its own.
* Ducking, measured on a burst with the bed alone audible either side: the bed
  sits **9.3 dB** lower under the voice and recovers **10.6 dB** after it. The
  first tuning gave only 4.4 dB, which was too polite to hear.
* Music is mixed **after** the voice is assembled, so every part's subtitle
  timing still lines up.

- [x] **M1** A folder can have one background track
      → *check:* set it, reload, it is still there (from the database)
- [x] **M2** Volume in plain words, not decibels
      → *check:* the control reads "discreet / present / loud"
- [x] **M3** Fade in and out, in seconds
      → *check:* the values are stored and used by the mix
- [x] **M4** The bed stretches to the whole length by itself — looped if short,
      trimmed with a fade if long
      → *check:* a 10 s bed under a 60 s folder produces 60 s of audio
- [x] **M5** Ducking: the music drops under the voice and returns in the gaps,
      on by default
      → *check:* measured level under speech is lower than in a silence
- [x] **M6** Stitch mixes it in; the voice is never re-encoded to do it
      → *check:* the stitched file contains both, and parts still match their
        subtitle timings
- [x] **M7** A strip showing the shape of the whole thing — voice blocks, gaps,
      the bed underneath
      → *check:* it renders and clicking a block scrolls to that part

## C — Remove what is duplicated

Done. The Script tab is gone — 312 lines of it — and its two scripts are folders
in Sandbox › Imported scripts, every unrendered block arriving as a draft.
Dropping a document now fills the open folder instead.

**The removal broke the page and I did not notice.** Deleting that block also
took `player` and `library` with it, and taking one line out of an if/else chain
left a dangling `else` — which killed every global in the app. The checker
happily reported 18/18 on a page that did not run.

So `check_app.py` now parses the page's script first, with `node --check`. That
class of mistake is a machine's job to catch, not mine.

- [x] **C1** The Script tab is retired into Projects, its scripts migrated
      → *check:* the tab is gone and the two saved scripts exist as folders
- [x] **C2** The Subtitles tab becomes *bring in outside audio*; anything a part
      can already do is removed from it
      → *check:* no duplicate transcribe/translate path remains
- [x] **C3** An action updates what changed instead of reloading the project
      → *check:* deleting a gap does not refetch the whole folder

---

## How this gets verified

1. `python check_app.py` — the data model, the database round-trips, and the
   absence of what should be gone.
2. A browser pass per stage, driving the real UI and reading back state.
3. `[x]` only with the output shown. `[~]` means built but unproven.

## Decisions taken

- **Which model** — Qwen on the key already in use. `qwen-plus` for rewriting,
  `qwen-flash` for splitting. No new account, same spend guard.
- **Nothing is spent without a press.** Every pass is a button, priced first.
- **The Script view is not in this round** — Mehdi chose B and C over it. Text
  states therefore work one part at a time, in the composer.

---

## D — Every run is written down

Added after an audit: the spend figure added up `generations.cost`, which only
ever knew about speech. Transcription, translation, rewriting, cloning, batches
and live previews were paid for and **never recorded**, so the number shown was
always lower than the truth.

- [x] **J1** A `jobs` table: one line per outbound call
- [x] **J2** No paid call escapes it — the check walks every function that asks
      the budget guard and fails if it neither logs nor goes through
      `_make_audio`
- [x] **J3** Failures and refusals are logged too, not only successes
- [x] **J4** The spend figure reads the ledger, not the audio table
- [x] **J5** A screen: totals, a breakdown by kind, and the last 60 runs with
      filters for kind and for what didn't work
- [x] **J6** Labelled as **our estimates** — Alibaba returns no price per call

Also removed while doing it: the last of the Script tab's server code
(`_script_render`, `_script_assemble`, `_block_render`) and six dead routes. One
of those routes still pointed at a method I had deleted, which broke **every**
POST in the app until it was found — the ledger test is what surfaced it.

The 32 past speech runs were backfilled from `generations`, dated when they
happened, so history isn't a hole.

---

## E — Activity: what the machine is doing, and has done

The ledger was bolted onto the "Spending" card in Settings, which was the short
path, not the right place. A record of work is not a setting.

It is now its own tab, shaped like an activity monitor: **what is running**, then
**the runs**, then **what it cost**. Settings keeps only the daily cap and the
warning threshold.

- [x] **A1** A run is written when it **starts** and closed when it ends. That
      one change gives the live view, the elapsed time, and a row that can point
      at what it finally produced — three things that were impossible when the
      line was only written at the end.
- [x] **A2** What is running survives a page reload, because it is read from the
      database rather than from a variable in the server's memory
- [x] **A3** A run links to the recording it made — click through to it
- [x] **A4** A batch is **one** run that opens into its parts
- [x] **A5** A run still marked running an hour later is marked *lost*, not left
      spinning forever
- [x] **A6** Settings no longer carries the ledger

Measured on a real pass: seen as `RUNNING · rewrite · shape · 1s`, then closed
as `ok · $0.00009 · took 1290 ms`.

### The mistake this uncovered

Moving the ledger out of Settings left three listeners pointing at elements that
no longer existed. `$("spendFilter")` returned null, `.addEventListener` threw,
and **the whole script stopped there** — every global defined after that line
silently vanished. The page looked fine and did nothing.

`check_app.py` now compares every `$("...")` in the script against the ids in
the page and fails on any that is missing. The one legitimate case — an element
built on demand — uses `maybe()` instead, which is what that helper is for.

---

## F — The player, and G — one file became three

**The player.** The browser's own control knew nothing about the work. Replaced
with a waveform you can read and click into, a speed control (1× · 1.25 · 1.5 ·
2 · 0.75), and keys: space, arrows for ±5 s, S for speed — all off while typing.

I had recommended **WaveSurfer.js** and then didn't use it: it is a dependency
to vendor and maintain for a single canvas, and the browser already decodes the
audio. The version shipped is 80 lines and adds nothing to the project.

**The split.** `ui/index.html` was 8,042 lines holding styles, markup and logic —
the reason a change in one place kept killing another. It is now:

| | |
|---|---|
| `ui/index.html` | 1,518 lines of markup |
| `ui/app.js` | 5,726 lines of logic |
| `ui/app.css` | 937 lines of styles |

**Nothing was reordered.** Verified by comparing the old file against the three
new ones with whitespace removed: the only difference is 424 characters of
header comments I wrote, and no function or id was lost. `node --check` now
reads `app.js` directly instead of digging it out of the markup.

One three-line script stays inline on purpose — it sets the theme before the
first paint, and moving it would make dark mode flash white on every load. The
checker allows exactly that and nothing longer.

Splitting `app.js` further by area is the obvious next step, and a separate one.

---

## H — Is it actually documented?

Measured rather than asserted, and the honest first answer was no. `app.js` had
46 section markers and read fine, but the markup had **one comment in 1,518
lines**, `db.py` sat at 2 % with 39 functions carrying no description, and a
section header in `app.js` still announced a ledger that had moved to Activity
two stages earlier.

Closed all three. Every function in `db.py`, `say.py`, `rewrite.py` and
`naming.py` now says what it is for, `server.py` is at 88/90 (the two left are
`__init__`), and the markup carries a note at each tab, the player and the block
of dialogs — including why the composer is *moved* into its dialog instead of
rebuilt there, which is the kind of thing that gets broken by someone tidying up.

Retired code is labelled as retired rather than left looking live: the six
`scripts`/`blocks` functions now say they are what remains of the Script tab.

| | before | after |
|---|---|---|
| `db.py` functions described | 56/95 | 95/95 |
| `server.py` | 60/90 | 88/90 |
| markup comments | 1 | 28 |

Checks after the pass: **37/37 · 22/22 · 18/18**, every module imports, and the
app serves its page, script, styles and `/api/activity`.

---

## I — Translation ate the tags, and Arabic never worked

Two separate faults, found by measuring finished recordings rather than by
opinion.

**The tags were being translated.** `qwen-mt` has no idea `[sad]` is an
instruction, so it returned `[sedih]` in Indonesian and `[حزين]` in Arabic —
neither of which is one of the 31 documented tags. Every tagging pass silently
evaporated the moment a script was translated. The tags are now cut out of the
text before it is sent, the words are translated as a numbered batch so the
model still sees them together, and the tags go back where they were.

**Arabic does not work, and it is not the language's fault.** Measured on the
same sentence, same voice, changing only the language:

| language | characters | audio | rate |
|---|---|---|---|
| French | 54 | 4.6 s | 11.7 char/s |
| Indonesian | 749 | 69.7 s | 10.8 char/s |
| Arabic | 43 | 1.6 s | **26.7 char/s** |
| Arabic | 174 | 1.1 s | **154.3 char/s** |

Three voices were tried on Arabic — a Chinese-origin one, another, and the
cloned voice: 26.7, 44.8 and 154.3 char/s, and one returned no audio at all.
The model's documentation lists Arabic among its 16 languages, and the language
hint is sent correctly, and the chunker splits the Arabic text correctly — all
three were eliminated before blaming the voice.

So it is **marked, not removed**: the chip reads `Arabic ⚠` with the measurement
behind it, and stays selectable. A voice that reads it may well appear.

- [x] **I1** Translating keeps the delivery tags
      → *check:* tags before == tags after, model stubbed, no spend
- [x] **I2** A translated line list keeps its alignment
      → *check:* 4 lines in, 4 out, a tags-only line survives, an empty one too
- [x] **I3** A language no voice can read is marked rather than hidden
      → *check:* the measurement is in the picker's tooltip
- [x] **I4** Audio far too short for its text is reported
      → *check:* fires at 363 char/s, quiet at 11.8

### What made this invisible for so long

A render can succeed, charge you, record no failure, and contain one second of
audio for a whole paragraph. Nothing in the app looked at the result. Now
`_make_audio` measures what came back against what was sent — every render path,
one function — and anything above 25 characters per second of audio says so in
amber. It never refuses and never retries: the file is kept and the money is
already spent either way. It just stops being silent.

Found while probing, worth writing down: a **bare voice key** (`loongryanma`
instead of `qwen-audio-3.0-tts-plus-loongryanma`) returns no audio with no
useful error. The app always sends full ids, so it is not a live bug — but it is
what made the first five probe calls come back empty.
