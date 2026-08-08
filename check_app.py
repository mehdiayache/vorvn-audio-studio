"""Proves, or fails to prove, the items in PLAN.md.

Run before and after every stage. FAIL is not an opinion.
"""

import re
import sys
from pathlib import Path

from services.alibaba import config as alibaba_config

ROOT = Path(__file__).parent
# The interface lives in three files now. Most checks look for a string
# anywhere in it, so they read the markup and the script together.
MARKUP = (ROOT / "ui" / "index.html").read_text()
BOOT_GUARD = (ROOT / "ui" / "core" / "boot-guard.js").read_text()
SCRIPT = (ROOT / "ui" / "app.js").read_text()
PLAYER = (ROOT / "ui" / "components" / "player.js").read_text()
AUDIO_TRIGGER = (ROOT / "ui" / "components" / "audio-trigger.js").read_text()
TAKE_CARD = (ROOT / "ui" / "components" / "take-card.js").read_text()
FILE_DROP = (ROOT / "ui" / "components" / "file-drop.js").read_text()
PART_ROW = (ROOT / "ui" / "features" / "projects" / "part-row.js").read_text()
EXPORT_CARD = (ROOT / "ui" / "features" / "projects" / "export-card.js").read_text()
HIERARCHY_VIEW = (ROOT / "ui" / "features" / "projects" / "hierarchy-view.js").read_text()
WORKSPACE_STATE = (ROOT / "ui" / "features" / "projects" / "workspace-state.js").read_text()
COMPOSER_FEATURE = (ROOT / "ui" / "features" / "composer" / "index.js").read_text()
VOICE_BROWSER = (ROOT / "ui" / "features" / "voices" / "browser.js").read_text()
VOICE_CLONE_RECORDER = (ROOT / "ui" / "features" / "voices" / "clone-recorder.js").read_text()
ASSET_BROWSER = (ROOT / "ui" / "features" / "assets" / "browser.js").read_text()
CAPTION_MANAGER = (ROOT / "ui" / "features" / "captions" / "manager.js").read_text()
PROJECT_MUSIC = (ROOT / "ui" / "features" / "projects" / "music.js").read_text()
ACTIVITY_FEATURE = (ROOT / "ui" / "features" / "activity" / "index.js").read_text()
BATCH_FEATURE = (ROOT / "ui" / "features" / "batch" / "index.js").read_text()
SETTINGS_FEATURE = (ROOT / "ui" / "features" / "settings" / "index.js").read_text()
SUBTITLES_FEATURE = (ROOT / "ui" / "features" / "subtitles" / "index.js").read_text()
MULTILINGUAL_FEATURE = (ROOT / "ui" / "features" / "multilingual" / "index.js").read_text()
API_CLIENT = (ROOT / "ui" / "core" / "api-client.js").read_text()
PROJECTS_API = (ROOT / "ui" / "services" / "projects-api.js").read_text()
PARTS_API = (ROOT / "ui" / "services" / "parts-api.js").read_text()
ASSETS_API = (ROOT / "ui" / "services" / "assets-api.js").read_text()
CAPTIONS_API = (ROOT / "ui" / "services" / "captions-api.js").read_text()
MEDIA_API = (ROOT / "ui" / "services" / "media-api.js").read_text()
STYLES = (ROOT / "ui" / "app.css").read_text()
PROJECT_STYLES = (ROOT / "ui" / "projects.css").read_text()
UI = (MARKUP + BOOT_GUARD + SCRIPT + PLAYER + AUDIO_TRIGGER + TAKE_CARD + FILE_DROP + PART_ROW + EXPORT_CARD +
      HIERARCHY_VIEW + WORKSPACE_STATE + COMPOSER_FEATURE + VOICE_BROWSER +
      VOICE_CLONE_RECORDER + ASSET_BROWSER + CAPTION_MANAGER + PROJECT_MUSIC + ACTIVITY_FEATURE +
      BATCH_FEATURE + SETTINGS_FEATURE + SUBTITLES_FEATURE + MULTILINGUAL_FEATURE +
      STYLES + PROJECT_STYLES)
SERVER = (ROOT / "server.py").read_text()
DB = (ROOT / "db.py").read_text()

results = []


def check(item: str, passed: bool, detail: str = ""):
    results.append((item, passed, detail))


# ── A — text states ─────────────────────────────────────────────────────
check("T1 a part stores raw, shaped and tagged text",
      all(column in DB for column in
          ("text_raw", "text_shaped", "text_tagged", "text_state"))
      and "text_tagged: textStates.tagged" in SCRIPT,
      "all three versions have database and Composer persistence")

check("T2 the composer has Raw / Shaped / Tagged tabs", 'id="textStates"' in UI)

# The UI builds the URL as /api/text/${kind}, so asserting the literal string
# in the page was checking my own spelling, not the feature.
check("T3 a 'make it speakable' pass exists",
      '"/api/text/shape"' in SERVER and "textPass(\"shape\")" in UI,
      "route on the server, reachable from the composer")

check("T4 the change is shown before it is accepted", 'id="shapeDiff"' in UI)

REWRITE = (ROOT / "rewrite.py").read_text()
check("T5 tagging has a density and uses only documented tags",
      'id="tagDensity"' in UI and '"/api/text/tag"' in SERVER
      and "strip_unknown" in REWRITE,
      "density control, route, and invented tags stripped before display")

# The server reaches the style through db.style_for, so requiring the column
# name in server.py was asserting an implementation detail that shouldn't exist.
check("T6 a venture owns its style prompt",
      "style_prompt" in DB and "db.style_for" in SERVER
      and '"/api/project/style"' in SERVER,
      "stored on the venture, inherited by folders below")

check("T7 every pass states its cost first", "textPassCost" in UI)

check("T8 you can go back to an earlier state", 'id="stateRevert"' in UI)

# ── B — music ───────────────────────────────────────────────────────────
# It links to an asset rather than owning a file, so the column is music_of.
check("M1 a folder can hold a background track",
      "music_of" in DB and "def music_get" in DB,
      "linked to an asset in the venture's library")

check("M2 volume is directly adjustable", "musicLevel" in UI and "music_volume" in DB)
check("M3 fades in seconds", "musicFadeIn" in UI)
# -stream_loop is the input-side loop; aloop is the filter version. Either
# proves the bed is extended rather than left short.
check("M4 the bed stretches to the length by itself",
      "-stream_loop" in SERVER and "atrim=start=" in SERVER and "duration=" in SERVER,
      "looped on input, slipped and trimmed to the voice's length")
check("M5 ducking under the voice", "sidechaincompress" in SERVER)
check("M6 the stitch mixes it in", "_mix_music" in SERVER)
check("M7 a strip showing the shape", 'id="folderStrip"' in UI)

# ── C — remove what is duplicated ───────────────────────────────────────
check("C1 the Script tab is retired",
      'data-tab="script"' not in UI,
      "still present" if 'data-tab="script"' in UI else "gone")

# This was a false pass: it looked for an id that never existed, so it was
# always true, while the tab went on transcribing your own recordings — the
# exact thing a part already does from its own row.
sub_tab = MARKUP[MARKUP.index('id="tab-subtitles"'):MARKUP.index('id="tab-settings"')]
check("C2 the Subtitles tab no longer duplicates a part's own actions",
      "somewhere else" in sub_tab and 'id="subSourceMade" hidden' in sub_tab
      and "loadSubtitleFiles();" not in UI.split("loadSubHistory")[0][-200:],
      "it takes outside audio only; your own parts are done from their row")

check("C3 an action updates in place instead of refetching",
      "refreshPart(" in UI,
      "in-place update exists" if "refreshPart(" in UI else
      f"{UI.count('showProject(openProject.id)')} full reloads remain")

# ── D — every run is written down ───────────────────────────────────────
check("J1 there is a ledger of every run",
      "CREATE TABLE IF NOT EXISTS jobs" in DB and "def job(" in DB,
      "jobs table with a writer")

# The point of the ledger is that no paid call escapes it. Every function that
# checks the budget must also log — that is what was wrong before.
import re as _re2
paid = _re2.findall(r"def (_\w+)\(self[^)]*\):(.*?)(?=\n    def |\Z)", SERVER, _re2.S)
# Going through _make_audio counts: that is the one place synthesis happens and
# it logs. What must not exist is a paid call that neither logs nor delegates.
# A run may be written in one shot (_log) or opened and closed (_run/_done),
# and going through _make_audio counts because that is where synthesis logs.
missing = [name for name, body in paid
           if "_check_budget(" in body
           and not any(w in body for w in ("self._log(", "self._run(", "_make_audio("))
           and name != "_check_budget"]
check("J2 every paid call writes a line", not missing,
      "none missed" if not missing else "no log in: " + ", ".join(missing))

check("J3 failures and refusals are logged too",
      'status="failed"' in SERVER and 'status="blocked"' in SERVER)

check("J4 the spend figure comes from the ledger, not from audio",
      "FROM jobs" in DB and "def job_totals" in DB)

check("J5 a screen shows the runs",
      'id="tab-activity"' in UI and 'id="actRuns"' in UI,
      "its own tab, not a card in Settings")

check("A1 a run is opened and closed, not written at the end",
      "def job_start" in DB and "def job_finish" in DB and "elapsed_ms" in DB,
      "start/finish with elapsed time")

check("A2 what is running now survives a reload",
      "def jobs_running" in DB and 'status = %s' not in DB.split("def jobs_running")[1][:400]
      and 'id="runningList"' in UI,
      "read from the database, not from memory")

check("A3 a run points at what it produced",
      "generation_id=generation_id" in SERVER
      and ("generation_id=part[" in SERVER or "generation_id=draft[" in SERVER),
      "the row is closed with the recording it made")

check("A4 a batch is one run with its parts inside",
      "parent_id" in DB and "def job_children" in DB and 'data-children' in UI)

check("A5 a run left behind by a restart is reported",
      "def jobs_abandon_stale" in DB and "stale_closed" in SERVER,
      "marked lost rather than spinning forever")

check("A6 Settings keeps only the settings",
      'id="actRuns"' not in MARKUP.split('id="tab-settings"')[1],
      "the ledger moved out of Settings")

check("J6 actual token costs and estimates are visibly distinct",
      "actual tokens" in UI and "estimate" in UI and "cost_basis" in DB,
      "Omni usage is exact; unsupported services stay labelled estimates")

# ── F — the player ──────────────────────────────────────────────────────
check("F1 the waveform is drawn, not a browser control",
      'id="wave"' in UI and "decodeAudioData" in UI and 'id="audio" hidden' in UI,
      "peaks computed here, no dependency")
check("F2 playback speed", 'id="playSpeed"' in UI and "playbackRate" in UI)
check("F3 keyboard: space, arrows, S",
      'event.key === " "' in UI and "ArrowLeft" in UI and 'toLowerCase() === "s"' in UI)
check("F4 clicking the waveform seeks",
      "el.wave.onclick" in PLAYER and "getBoundingClientRect" in PLAYER)
check("F5 one media engine serves the whole application",
      len(re.findall(r"<audio\b", MARKUP)) == 1
      and "new Audio(" not in SCRIPT + PLAYER
      and '<script src="/components/player.js"></script>' in MARKUP
      and MARKUP.index('/components/player.js') < MARKUP.index('/app.js')
      and all(old not in UI for old in ('id="audioPlayer"', 'id="subPlayer"', 'id="recordPreview"')),
      "History, voices, takes, subtitles and recording share #audio")
check("F6 the player carries the voice identity",
      'id="playerAvatar"' in MARKUP
      and "renderVoice(track.voice)" in PLAYER
      and "renderVoice: voice => voiceAvatar" in SCRIPT,
      "photo, stable initials or music fallback")
check("F7 Retina waveform dimensions stay bounded",
      "canvas.height = pixelHeight" in PLAYER
      and "const height = Math.max(1, canvas.clientHeight)" in PLAYER
      and "canvas.height = height *" not in PLAYER,
      "CSS size is the source of truth on every redraw")
check("F8 stale waveform requests cannot repaint a new track",
      "request === wave.request" in PLAYER and "wave.forUrl === url" in PLAYER)
check("F9 play triggers and takes use shared component contracts",
      '<script src="/components/audio-trigger.js"></script>' in MARKUP
      and '<script src="/components/take-card.js"></script>' in MARKUP
      and "StudioAudioTrigger.bind" in SCRIPT
      and "takeCards.render" in SCRIPT
      and 'className = "take-card"' not in SCRIPT
      and 'className = "take-row"' not in SCRIPT,
      "one audio binder and one semantic take renderer")

# ── I — translation must not eat the tags ───────────────────────────────
# `[sad]` came back as `[sedih]` and `[حزين]`. Those are not tags, so the whole
# tagging pass vanished the moment a script was translated. This runs the real
# masking with the model stubbed out — no network, no spend.
import translate as _tr
import say as _say

_original_call = _tr._call
try:
    _tr._call = lambda model, text, source, target: "\n".join(
        f"{line.partition('.')[0]}. TRANSLATED" if line.strip() else line
        for line in text.splitlines()) if text.strip()[:1].isdigit() else "TRANSLATED"
    _before = "[sad] Sandy is not a cat. [amazed] She is a spaceship."
    _after = _tr.translate_text(_before, "Arabic")
    _lines = _tr.translate_lines(["[whispering] come here", "plain", "[laughing]", ""],
                                 "French")
    check("I1 translating keeps the delivery tags",
          _say.TAG_RE.findall(_before) == _say.TAG_RE.findall(_after),
          f"{_say.TAG_RE.findall(_after)} came back"
          if _say.TAG_RE.findall(_before) != _say.TAG_RE.findall(_after)
          else "same tags, in the same order")
    check("I2 a translated line list keeps its alignment",
          len(_lines) == 4 and _lines[2] == "[laughing]" and _lines[3] == "",
          f"{len(_lines)} lines back for 4 given")
finally:
    _tr._call = _original_call

check("I3 Arabic is routed to an officially compatible speech engine",
      alibaba_config.recommended_engine("Arabic") == "omni"
      and "qwen3.5-omni" in str(alibaba_config.CAPABILITIES["omni"])
      and 'id="engine"' in MARKUP and "syncEngineUI" in SCRIPT,
      "capability map, backend fallback and visible engine selector")

check("I3b clone audio meets Omni's minimum sample rate",
      '"-ar", "24000"' in SERVER and '"pcm_s16le"' in SERVER,
      "24 kHz, 16-bit PCM before enrollment")

check("I3c the composer picker always exposes cloned voices",
      'setMode("picker")' in VOICE_BROWSER
      and 'voiceGroup("Your cloned voices"' in SCRIPT,
      "owned clones first, stock catalogue second")

# ── I4 — a render that comes back far too short says so ─────────────────
# A part can render "successfully" and hold one second of audio for a whole
# paragraph, with no failure recorded anywhere. Silence is the wrong answer.
from server import truncation_warning as _warn


class _Opts:
    language = "Arabic"


_short = _warn("x" * 400, 1100, _Opts())      # 363 char/s — the real Arabic case
_normal = _warn("x" * 400, 34000, _Opts())    # 11.8 char/s — a normal reading
check("I4 audio far too short for its text is reported",
      bool(_short) and not _normal and "warning" in SERVER
      and "setRendered" in SCRIPT,
      "flagged at 363 char/s, quiet at 11.8" if _short and not _normal
      else "the guard does not fire")

# ── Projects — navigation and hierarchy must stay trustworthy ──────────
check("PR1 stale project responses cannot replace the current folder",
      "let projectRequest = 0" in SCRIPT
      and "if (request !== projectRequest) return" in SCRIPT,
      "navigation is guarded by a monotonically increasing request id")
check("PR2 delayed name and description saves keep their original target",
      "const id = openProject.id;" in SCRIPT
      and "const name = event.currentTarget.value;" in SCRIPT
      and "const description = event.currentTarget.value;" in SCRIPT,
      "autosaves capture both the project id and field value")
check("PR3 stitched exports are not counted as source parts",
      DB.count("coalesce(g.kind, '') <> 'stitch'") >= 2,
      "own and rolled-up counts exclude stitch rows")
check("PR4 project content supports Arabic and other RTL scripts",
      'class="part-text" dir="auto"' in PART_ROW
      and 'id="projectName" class="head-title" dir="auto"' in MARKUP,
      "names, descriptions and spoken text use automatic direction")
check("PR5 an empty global player cannot cover project controls",
      '.player[data-state="empty"]' in STYLES
      and "pointer-events: none" in STYLES,
      "the player leaves the viewport until a track is loaded")
check("PR6 deletion describes the real cascading behavior",
      "nested Project/Production structure are removed" in SCRIPT
      and "Projects inside move up a level" not in SCRIPT,
      "audio is preserved; deleted hierarchy is not falsely promised")
PROJECT_STYLES = (ROOT / "ui" / "projects.css").read_text()
PROJECT_CORE = (ROOT / "ui" / "projects-core.js").read_text()
check("PR7 the Projects workspace is isolated from shared UI styling",
      '<link rel="stylesheet" href="/projects.css">' in MARKUP
      and ".project-workbench" in PROJECT_STYLES
      and ".project-production" in PROJECT_STYLES,
      "dedicated stylesheet and reusable workspace regions")
check("PR8 ventures have a brand identity distinct from daily folders",
      'id="projectNewTop" hidden' in MARKUP
      and 'brand ? icon("venture")' in SCRIPT
      and '$("emojiSection").style.display = brand ? "none" : ""' in SCRIPT
      and '"Venture settings"' in SCRIPT,
      "home-only creation, logo flow, and venture-specific settings")
check("PR9 Projects has real URL state and a reusable timeline",
      '<script src="/projects-core.js"></script>' in MARKUP
      and "function readRoute" in PROJECT_CORE
      and "function timelineMarkup" in PROJECT_CORE
      and 'window.addEventListener("popstate", applyLocationRoute)' in SCRIPT
      and 'href="#" data-go=' not in SCRIPT,
      "direct URLs, Back/Forward, and named Timeline component")
check("PR10 every Projects view consumes one hierarchy model",
      "function hierarchy" in PROJECT_CORE
      and "contextFor" in PROJECT_CORE
      and "ProjectCore.hierarchy(projectTree)" in SCRIPT
      and "projectModel.childrenOf" in SCRIPT
      and "projectModel.pathOf" in SCRIPT
      and "projectModel.search" in SCRIPT,
      "rail, cards, picker, paths and capabilities share indexed data")
check("PR11 every Projects source part uses one typed row component",
      '<script src="/features/projects/part-row.js"></script>' in MARKUP
      and "ProjectPartRow.create" in SCRIPT
      and "partRows.render" in SCRIPT
      and 'row.innerHTML =\n      `<label class="part-pick"' not in SCRIPT
      and all(kind in PART_ROW for kind in
              ('part.kind === "silence"', 'part.kind === "draft"',
               'part.kind === "asset"', 'extraClass')),
      "audio, draft, silence and linked assets share a callback-only renderer")
check("PR12 hierarchy identity is shared without collapsing level views",
      '<script src="/features/projects/hierarchy-view.js"></script>' in MARKUP
      and all(call in SCRIPT for call in
              ("projectViews.rail", "projectViews.ventureCard",
               "projectViews.projectCard", "projectViews.folderCard",
               "projectViews.picker"))
      and all(renderer in HIERARCHY_VIEW for renderer in
              ("function rail", "function ventureCard", "function projectCard",
               "function folderCard", "function picker"))
      and "fetch(" not in HIERARCHY_VIEW and "api(" not in HIERARCHY_VIEW,
      "brand, production and finished-piece cards have separate renderers")
check("PR12b deep hierarchy keeps a readable name column",
      "Math.min(depth, 1)" in HIERARCHY_VIEW
      and "row.dataset.depth" in HIERARCHY_VIEW
      and 'grid-template-columns: 280px minmax(0, 1fr)' in PROJECT_STYLES,
      "compact Explorer preserves the canvas and indentation stops consuming names")
check("PR13 workspace permissions are derived outside the DOM controller",
      '<script src="/features/projects/workspace-state.js"></script>' in MARKUP
      and "ProjectWorkspaceState.derive" in SCRIPT
      and "function derive" in WORKSPACE_STATE
      and "querySelector" not in WORKSPACE_STATE
      and "getElementById" not in WORKSPACE_STATE
      and "fetch(" not in WORKSPACE_STATE,
      "one pure state decides capabilities and visibility for every hierarchy level")
check("PR14 Projects consumes one movable Composer feature",
      '<script src="/features/composer/index.js"></script>' in MARKUP
      and "StudioComposer.create" in SCRIPT
      and "const composer = {" not in SCRIPT
      and "let insertAt" not in SCRIPT
      and SCRIPT.count("composer.at") >= 3
      and all(member in COMPOSER_FEATURE for member in
              ("target: null", "editing: null", "at: null", "home()", "open({", "describe()"))
      and "fetch(" not in COMPOSER_FEATURE and "api(" not in COMPOSER_FEATURE,
      "destination, editing and insertion state belong to the singleton feature")
check("PR15 Composer consumes one movable Voice browser feature",
      '<script src="/features/voices/browser.js"></script>' in MARKUP
      and "StudioVoiceBrowser.create" in SCRIPT
      and "const voiceBrowser = {" not in SCRIPT
      and all(member in VOICE_BROWSER for member in
              ("picking: null", "home()", "async pick(", "choose(id)", "cancel()"))
      and 'addEventListener("cancel"' in VOICE_BROWSER
      and 'addEventListener("keydown"' not in VOICE_BROWSER
      and "fetch(" not in VOICE_BROWSER and "api(" not in VOICE_BROWSER,
      "picker state, DOM movement and modal-safe exits belong to the singleton feature")
check("PR16 Projects consumes one safe venture Asset browser",
      '<script src="/features/assets/browser.js"></script>' in MARKUP
      and "StudioAssetBrowser.create" in SCRIPT
      and "let assetInsertAt" not in SCRIPT
      and all(member in ASSET_BROWSER for member in
              ("context: null", "async open(", "destination()", "draw()", "row(asset)", "close()"))
      and 'className = "ghost fit asset-insert"' in ASSET_BROWSER
      and "haystack.toLowerCase().includes(query)" in ASSET_BROWSER
      and "fetch(" not in ASSET_BROWSER and "api(" not in ASSET_BROWSER,
      "destination is captured and preview cannot accidentally insert an asset")
check("PR17 stitched files are outputs, not fake source parts",
      '<script src="/features/projects/export-card.js"></script>' in MARKUP
      and "ProjectExportCard.create" in SCRIPT
      and "renderProjectExports(stitches)" in SCRIPT
      and 'draw(part, "▣", "stitched")' not in SCRIPT
      and all(word in EXPORT_CARD for word in
              ("Latest export", "Earlier export", "Play this export", "Download"))
      and "fetch(" not in EXPORT_CARD and "api(" not in EXPORT_CARD,
      "Mix/Export owns versioned outputs; the source sequence does not")
check("PR18 one Caption manager owns originals and translations",
      '<script src="/features/captions/manager.js"></script>' in MARKUP
      and "StudioCaptionManager.create" in SCRIPT
      and "openSubtitleFile" not in SCRIPT
      and SCRIPT.count("captionManager.open") == 2
      and all(member in CAPTION_MANAGER for member in
              ("async open(", "async reload(", "async select(", "makeOriginal()",
               "makeTranslation()", "drawPreview()", "download()"))
      and "session !== this.session" in CAPTION_MANAGER
      and "request !== this.selectRequest" in CAPTION_MANAGER
      and "downloadText" in CAPTION_MANAGER
      and ".caption-dialog [hidden]" in STYLES
      and "fetch(" not in CAPTION_MANAGER and "api(" not in CAPTION_MANAGER,
      "the selected transcript supplies its own preview and downloaded contents")

check("PR19 Project music is an injected feature",
      '<script src="/features/projects/music.js"></script>' in MARKUP
      and "StudioProjectMusic.create" in SCRIPT
      and "let musicNow" not in SCRIPT
      and all(member in PROJECT_MUSIC for member in
              ("async function load", "async function save", "assetService.list",
               "player.toggle", "get current()"))
      and "fetch(" not in PROJECT_MUSIC and '"/api/' not in PROJECT_MUSIC,
      "state, controls, asset choice and playback are outside app.js")
check("PR19b music and hierarchy creation are visible at the decision point",
      '<section id="musicBlock" class="music-panel"' in MARKUP
      and 'id="musicPick">Add background music</button>' in MARKUP
      and 'id="musicLibrary"' in MARKUP
      and 'openLibrary: () =>' in SCRIPT
      and MARKUP.index('id="projectNew"') < MARKUP.index('class="project-workbench"')
      and 'id="projectStructureGroup"' not in MARKUP
      and "radial-gradient(circle at 92% 10%" not in PROJECT_STYLES
      and "radial-gradient(circle at 100% 0%" not in PROJECT_STYLES,
      "music is explicit in production; creation precedes cards; Ventures stay flat")
check("PR19c Production has one editor shell instead of three competing columns",
      'id="projectExplorerToggle"' in MARKUP
      and 'id="projectPanelToggle"' in MARKUP
      and 'id="projectPanelBackdrop"' in MARKUP
      and 'function setProjectExplorer' in SCRIPT
      and 'function openProjectPanel' in SCRIPT
      and '.project-production.open' in PROJECT_STYLES
      and 'position: fixed' in PROJECT_STYLES,
      "Explorer collapses; Mix/Export is an off-canvas production panel")
check("PR19d timeline and Project Composer expose production semantics",
      'class="production-timeline"' in PROJECT_CORE
      and 'class="timeline-lane"' in PROJECT_CORE
      and 'Trimmed from' in PROJECT_CORE and 'Looped from' in PROJECT_CORE
      and 'id="projectComposerInline"' in MARKUP
      and 'Generate & add Part' in COMPOSER_FEATURE
      and 'get("projectComposerInline").hidden = !inline' in COMPOSER_FEATURE,
      "narration/music share one clock and generation names its destination")
check("PR19e Preview hears the same narration and music pipeline as Export",
      "/api/project/preview" in SERVER and "_production_preview" in SERVER and
      "_render_sequence(parts" in SERVER and "_mix_music(voice" in SERVER and
      "projectService.preview" in SCRIPT,
      "one cached local render, no model call and no fake Export")
check("PR20 asset collections upload instead of generating",
      "def is_asset_folder" in DB
      and "def _asset_upload" in SERVER
      and 'path == "/api/asset/upload"' in SERVER
      and 'id="assetLibraryBlock"' in MARKUP
      and "showAssetLibrary: libraryFolder" in WORKSPACE_STATE
      and "showPartAdd: !bucket && holdsParts && !libraryFolder" in WORKSPACE_STATE
      and "showProduction: !bucket && holdsParts && !libraryFolder" in WORKSPACE_STATE
      and "assetService.upload" in SCRIPT
      and 'addEventListener("drop"' in SCRIPT,
      "fixed venture libraries accept free audio uploads and expose no Composer/Finish")
check("PR21 every upload surface accepts drag and drop",
      'global.StudioFileDrop = Object.freeze({ bind, assign })' in FILE_DROP
      and all(f'id="{target}"' in MARKUP for target in
              ("assetUploadZone", "cloneFileDrop", "batchFileDrop",
               "subUploadDrop", "iconFileDrop"))
      and all(0 < MARKUP.find(f'id="{input_id}"') -
                  MARKUP.find(f'id="{target}"') < 500
              for target, input_id in
              (("assetUploadZone", "assetUploadInput"),
               ("cloneFileDrop", "cloneFile"),
               ("batchFileDrop", "batchFile"),
               ("subUploadDrop", "subUpload"),
               ("iconFileDrop", "iconFile")))
      and all(f'target: $("{target}")' in UI or f'target: get("{target}")' in UI
              for target in
              ("assetUploadZone", "cloneFileDrop", "batchFileDrop",
               "subUploadDrop", "iconFileDrop")),
      "one file-drop component serves libraries, cloning, batches, subtitles and pictures")

# ── API boundary ────────────────────────────────────────────────────────
check("API1 browser transport has one owner",
      '<script src="/core/api-client.js"></script>' in MARKUP
      and "StudioApiClient.create" in SCRIPT
      and "const api = async" not in SCRIPT
      and "fetchImpl" in API_CLIENT and "spendGuarded" in API_CLIENT,
      "decoding, network failures and spend confirmation are centralized")
check("API2 core domains use service adapters",
      all(src in MARKUP for src in
          ('/services/projects-api.js', '/services/parts-api.js',
           '/services/assets-api.js', '/services/captions-api.js',
           '/services/media-api.js'))
      and all(factory in SCRIPT for factory in
              ("StudioProjectsApi.create", "StudioPartsApi.create",
               "StudioAssetsApi.create", "StudioCaptionsApi.create",
               "StudioMediaApi.create"))
      and not any(route in SCRIPT for route in
                  ('api("/api/projects"', 'api("/api/project?',
                   'api("/api/project/create"', 'api("/api/generation/full"',
                   'fetch("/api/project/icon/upload"')),
      "features call domain operations, not Projects/Parts endpoint strings")
check("API3 public v1 has typed hierarchy reads",
      all(route in SERVER for route in
          ('segments == ["ventures"]', 'segments[0] == "ventures"',
           'segments[0] == "projects"', '"productions", "folders"',
           'segments[0] == "parts"'))
      and "def _v1_container" in SERVER and "def _v1_part" in SERVER
      and "def _v1_asset" in SERVER and "def _v1_export" in SERVER
      and '"request_id": f"req_' in SERVER
      and '"audio_url": f"/audio/' in SERVER
      and "urlsafe_b64encode" in SERVER and '"next_cursor"' in SERVER,
      "typed hierarchy resources, stable errors and cursor pagination")
check("API4 public Parts exclude exports and normalize silence",
      'if part.get("kind") != "stitch"' in SERVER
      and 'part.get("kind") == "silence"' in SERVER
      and 'float(part.get("title") or 0) * 1000' in SERVER,
      "stitches remain outputs; silent parts expose their real duration")

# ── the page has to parse at all ────────────────────────────────────────
# Removing one line of an if/else chain left a dangling `else`, and every
# global in the app vanished. Nothing else in this file matters if the script
# doesn't run, so it is checked first from now on.
import re as _re
import shutil
import subprocess
import tempfile

biggest = SCRIPT
if shutil.which("node"):
    script_paths = [ROOT / "ui" / "app.js", ROOT / "ui" / "projects-core.js",
                    ROOT / "ui" / "core" / "boot-guard.js",
                    ROOT / "ui" / "components" / "player.js",
                    ROOT / "ui" / "components" / "audio-trigger.js",
                    ROOT / "ui" / "components" / "take-card.js",
                    ROOT / "ui" / "components" / "file-drop.js",
                    ROOT / "ui" / "features" / "projects" / "hierarchy-view.js",
                    ROOT / "ui" / "features" / "projects" / "workspace-state.js",
                    ROOT / "ui" / "features" / "projects" / "part-row.js",
                    ROOT / "ui" / "features" / "projects" / "export-card.js",
                    ROOT / "ui" / "features" / "projects" / "music.js",
                    ROOT / "ui" / "features" / "composer" / "index.js",
                    ROOT / "ui" / "features" / "voices" / "browser.js",
                    ROOT / "ui" / "features" / "voices" / "clone-recorder.js",
                    ROOT / "ui" / "features" / "assets" / "browser.js"]
    script_paths.append(ROOT / "ui" / "features" / "captions" / "manager.js")
    script_paths.extend([ROOT / "ui" / "core" / "api-client.js",
                         ROOT / "ui" / "services" / "projects-api.js",
                         ROOT / "ui" / "services" / "parts-api.js",
                         ROOT / "ui" / "services" / "assets-api.js",
                         ROOT / "ui" / "services" / "captions-api.js",
                         ROOT / "ui" / "services" / "media-api.js"])
    script_paths.extend([ROOT / "ui" / "features" / "activity" / "index.js",
                         ROOT / "ui" / "features" / "batch" / "index.js",
                         ROOT / "ui" / "features" / "settings" / "index.js",
                         ROOT / "ui" / "features" / "subtitles" / "index.js",
                         ROOT / "ui" / "features" / "multilingual" / "index.js"])
    checks = [subprocess.run(["node", "--check", str(path)], capture_output=True,
                             text=True) for path in script_paths]
    failed = next((done for done in checks if done.returncode), None)
    complaint = ((failed.stderr if failed else "").splitlines() or [""])[:4]
    check("P0 the page's scripts parse", failed is None,
          "all component and composition scripts clean" if failed is None
          else " ".join(line.strip() for line in complaint if line.strip())[:90])
else:
    check("P0 the page's scripts parse", True, "node not available — not checked")

# ── every id the script reaches for must exist ──────────────────────────
# Moving the ledger out of Settings left listeners pointing at elements that no
# longer existed, and `$(...)` returning null stopped the whole script — every
# global after that line vanished, silently. A missing id is a build error now.
# An element can be in the markup or built by the script — both count. What
# must not exist is a lookup for an id that appears in neither.
ids_in_html = (set(_re.findall(r'id="([\w-]+)"', MARKUP))
               | set(_re.findall(r'id="([\w-]+)"', SCRIPT))
               | set(_re.findall(r'\.id = "([\w-]+)"', SCRIPT)))
looked_up = set(_re.findall(r'\$\("([\w-]+)"\)', biggest))
absent = sorted(looked_up - ids_in_html)
check("P1 every element the script uses exists", not absent,
      "all present" if not absent else f"missing: {', '.join(absent[:6])}")

check("P2 Chrome cannot mistake technical settings for an address form",
      all(token in MARKUP for token in
          ('id="referenceStorageForm" autocomplete="off"',
           'id="alibabaCredentialsForm" autocomplete="off"',
           'name="object_storage_endpoint_url"',
           'name="object_storage_signing_region"',
           'autocomplete="new-password"',
           'type="button" class="ghost next" id="saveStorage"'))
      and "hardenTechnicalForms" in SCRIPT
      and "new MutationObserver" in SCRIPT
      and "form.addEventListener(\"submit\"" in SCRIPT,
      "isolated forms plus protection for dynamically added technical controls")
check("P3 inactive SPA tabs are inert",
      '<section class="tab on" id="tab-speak">' in MARKUP
      and all(f'<section class="tab" id="tab-{name}" inert>' in MARKUP
              for name in ("projects", "batch", "voices", "activity",
                           "subtitles", "settings"))
      and "tab.inert = !selected" in SCRIPT
      and "activateTab($(\"tab-\" + btn.dataset.tab))" in SCRIPT,
      "only the visible screen participates in focus and browser heuristics")

# ── G — the interface is no longer one file ─────────────────────────────
# One tiny script stays inline on purpose: it sets the theme before the first
# paint, and moving it to a file would make dark mode flash white on every load.
inline = _re.findall(r"<script>(.*?)</script>", MARKUP, _re.S)
check("G1 styles, markup and script are separate files",
      (ROOT / "ui" / "app.css").exists() and (ROOT / "ui" / "app.js").exists()
      and "<style>" not in MARKUP
      and '<script src="/app.js">' in MARKUP
      and all(len(block.splitlines()) <= 5 for block in inline),
      f"markup {len(MARKUP.splitlines())} lines · "
      f"script {len(SCRIPT.splitlines())} · styles {len(STYLES.splitlines())}")

# ── report ──────────────────────────────────────────────────────────────
width = max(len(name) for name, _, _ in results)
passed = 0
for name, ok, detail in results:
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<{width}}  {detail}")
    passed += ok
print(f"\n  {passed}/{len(results)} verified")
sys.exit(0 if passed == len(results) else 1)
