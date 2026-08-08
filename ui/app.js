/* Voice Studio — the whole interface.
   Moved out of index.html with nothing reordered: an 8,000-line file was
   the reason a change in one place kept killing another, and `node --check`
   can now read this directly instead of digging it out of the markup.
   Splitting it further by area is the next step, and a separate one. */
const $ = id => {
  const el = document.getElementById(id);
  // A removed element used to surface as "cannot read properties of null"
  // inside whatever unrelated function ran next. Shout instead.
  if (!el) console.error(`No element with id "${id}"`);
  return el;
};

/* For the ones that genuinely may not be there — a button that only exists for
   a cloned voice, say. Absence is an answer, not a fault. */
const maybe = id => document.getElementById(id);

/* ── shared components ────────────────────────────────────────────────────
   Everything the app asks a person goes through these, so a question always
   looks and behaves the same. The browser's own prompt/confirm never appear. */
const ui = {
  /* Ask a question. Returns the typed value, true, or null when dismissed. */
  ask({ title, body = "", label = "", value = "", ok = "OK", danger = false,
        placeholder = "", choices = null, choiceLabel = "", pre = "" } = {}) {
    return new Promise(resolve => {
      $("askTitle").textContent = title;
      $("askBody").textContent = body;
      $("askBody").style.display = body ? "" : "none";
      const wantsInput = label !== "";
      $("askFieldWrap").style.display = wantsInput ? "" : "none";
      $("askLabel").textContent = label;
      $("askInput").value = value;
      $("askInput").placeholder = placeholder;

      const wantsChoice = Array.isArray(choices) && choices.length > 0;
      $("askChoiceWrap").style.display = wantsChoice ? "" : "none";
      $("askChoiceLabel").textContent = choiceLabel;
      if (wantsChoice) {
        $("askChoice").innerHTML = "";
        for (const c of choices) {
          $("askChoice").add(new Option(c.label ?? c, c.value ?? c));
        }
        if (value) $("askChoice").value = value;   // start on what's already set
      }
      $("askPre").style.display = pre ? "" : "none";
      $("askPre").textContent = pre;
      $("askOk").textContent = ok;
      $("askOk").className = danger ? "primary danger-solid" : "primary";

      const finish = result => {
        $("askOk").onclick = $("askCancel").onclick = null;
        $("ask").removeEventListener("cancel", onCancel);
        if ($("ask").open) $("ask").close();
        resolve(result);
      };
      const onCancel = () => finish(null);
      $("askOk").onclick = () => finish(
        wantsChoice ? $("askChoice").value
        : wantsInput ? ($("askInput").value.trim() || null)
        : true);
      $("askCancel").onclick = onCancel;
      $("ask").addEventListener("cancel", onCancel);
      $("askInput").onkeydown = e => { if (e.key === "Enter") $("askOk").click(); };

      $("ask").showModal();
      if (wantsInput) { $("askInput").focus(); $("askInput").select(); }
    });
  },

  /* A yes/no where "yes" is destructive. */
  confirm(title, body, ok = "Delete") {
    return this.ask({ title, body, ok, danger: true });
  },

  /* A deliberate blank state — never an empty box with no explanation. */
  empty(title, hint, actionLabel, onAction) {
    const box = document.createElement("div");
    box.className = "empty";
    box.innerHTML = `<b>${title}</b>${hint}`;
    if (actionLabel) {
      const button = document.createElement("button");
      button.className = "ghost next";
      button.style.marginTop = "14px";
      button.textContent = actionLabel;
      button.onclick = onAction;
      box.appendChild(button);
    }
    return box;
  },
};

/* Pricing lives on the server; the page must never carry its own copy. */
function rateFor(tier) {
  const engine = maybe("engine")?.value || "audio";
  const rates = config.capabilities?.[engine]?.estimate_rates_per_million_chars
    || config.rates || { plus: 20, flash: 15 };
  return rates[tier] ?? rates.plus;
}

/* ── live progress while a render runs ────────────────────────────────── */
let progressPoll = null;

function watchProgress(statusId) {
  clearInterval(progressPoll);
  progressPoll = setInterval(async () => {
    try {
      const p = await api("/api/progress");
      if (!p.active) return;
      const el = document.getElementById(statusId);
      if (!el) return;
      // The counter names the part being worked on, so the percentage has to
      // count that part too — otherwise "40 of 40" reads as 98%.
      const current = Math.min(p.done + 1, p.total);
      const pct = p.total ? Math.round(current / p.total * 100) : 0;
      el.className = "status busy";
      el.textContent =
        `${p.stage} — ${current} of ${p.total}` +
        (p.total > 1 ? ` (${pct}%)` : "") +
        (p.label ? ` · "${p.label}${p.label.length >= 60 ? "…" : ""}"` : "");
    } catch { /* the server may be mid-restart; the next tick retries */ }
  }, 400);
}

function stopWatchingProgress() {
  clearInterval(progressPoll);
  progressPoll = null;
}

/* ── theme ────────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  $("themeToggle").textContent = theme === "dark" ? "☀" : "☾";
  $("themeToggle").title = theme === "dark" ? "Switch to light" : "Switch to dark";
}
// Light by default — the toggle only matters once it's been used.
applyTheme(localStorage.getItem("theme") || "light");
$("shortcutHelp").onclick = () => ui.ask({
  title: "Keyboard shortcuts",
  pre: "⌘ / Ctrl + Enter     Generate, or render pending blocks\n" +
       "⌘ / Ctrl + K         Browse and audition voices\n" +
       "⌘ / Ctrl + 1 … 7     Switch tabs, left to right\n" +
       "Esc                  Close whatever is open",
  ok: "Got it",
});
$("themeToggle").onclick = () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

let config = {};

const apiClient = StudioApiClient.create({
  confirmSpend: ({ describe, estimate, warnAbove }) => ui.ask({
    title: "This one costs more than usual",
    body: `${describe} will cost about $${estimate}, which is over your ` +
          `$${warnAbove} warning limit.`,
    ok: `Spend $${estimate}`,
  }),
});
const api = apiClient.request;
const projectService = StudioProjectsApi.create(apiClient);
const partService = StudioPartsApi.create(apiClient);
const assetService = StudioAssetsApi.create(apiClient);
const captionService = StudioCaptionsApi.create(apiClient);
const mediaService = StudioMediaApi.create(apiClient);

const setStatus = (id, text, kind = "") => {
  $(id).className = "status " + kind;
  $(id).textContent = text;
};

/* A render can succeed and still be wrong: the model sometimes returns one
   second of audio for a full paragraph and reports no failure at all. The
   server measures it and says so; this is the one place that gets shown, so
   every render path reports it the same way. */
const setRendered = (id, note, warning) =>
  setStatus(id, warning ? `${note} ${warning}` : note, warning ? "warn" : "ok");

/* ── tabs ─────────────────────────────────────────────────────────────── */
let applyingLocationRoute = false;

/* Chrome classifies unowned controls with heuristics. In this SPA that made
   technical storage values look like a postal address. Keep inactive screens
   out of focus/navigation and make every Settings control opt out unless its
   markup deliberately declares a more specific autocomplete contract. */
function hardenTechnicalControl(control) {
  if (!control.hasAttribute("autocomplete")) control.setAttribute("autocomplete", "off");
}

function hardenTechnicalForms(root = $("tab-settings")) {
  if (root.matches?.("input, select, textarea")) hardenTechnicalControl(root);
  root.querySelectorAll?.("input, select, textarea").forEach(hardenTechnicalControl);
  document.querySelectorAll("form[autocomplete='off']").forEach(form => {
    if (form.dataset.submitGuard) return;
    form.dataset.submitGuard = "true";
    form.addEventListener("submit", event => event.preventDefault());
  });
}

function activateTab(active) {
  document.querySelectorAll(".tab").forEach(tab => {
    const selected = tab === active;
    tab.classList.toggle("on", selected);
    tab.inert = !selected;
  });
}

hardenTechnicalForms();
new MutationObserver(records => records.forEach(record =>
  record.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) hardenTechnicalForms(node);
  }))).observe($("tab-settings"), { childList: true, subtree: true });

document.querySelectorAll("nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    activateTab($("tab-" + btn.dataset.tab));
    // Leaving a screen stops whatever it was playing: hearing a voice from a
    // tab you can no longer see is the app talking to itself.
    player.stop();
    if (btn.dataset.tab !== "projects" && composer.target) composer.home();
    if (btn.dataset.tab === "projects" && !openProject) showHome();
    else if (btn.dataset.tab === "projects") loadProjectTree();
    if (btn.dataset.tab === "voices") openVoicesTab();
    // While the tab is open, keep it live; stop the moment you leave.
    activityController.stop();
    if (btn.dataset.tab === "activity") activityController.start();
    if (btn.dataset.tab === "batch") batchController.showSettings();
    if (btn.dataset.tab === "settings") {
      settingsController.loadPronunciations(); activityController.loadSpend();
      settingsController.loadDisk(); loadPromptEditor();
    }
    if (btn.dataset.tab === "subtitles") {
      subtitlesController.loadHistory();
      subtitlesController.loadVocabularies();
      subtitlesController.loadLanguages();
    }
    if (!applyingLocationRoute && btn.dataset.tab !== "projects")
      ProjectCore.writeRoute({ tab: btn.dataset.tab });
    else if (!applyingLocationRoute && btn.dataset.tab === "projects" && openProject)
      ProjectCore.writeRoute({ tab: "projects", projectId: openProject.id });
  };
});

async function applyLocationRoute() {
  const route = ProjectCore.readRoute();
  const button = document.querySelector(`nav button[data-tab="${route.tab}"]`);
  if (!button) return;
  applyingLocationRoute = true;
  try {
    button.click();
    if (route.tab === "projects") {
      if (route.projectId) await showProject(route.projectId, { historyMode: "none" });
      else await showHome({ historyMode: "none" });
    }
  } finally {
    applyingLocationRoute = false;
  }
}

window.addEventListener("popstate", applyLocationRoute);

/* ── speak tab ────────────────────────────────────────────────────────── */
function insertAtCursor(el, snippet) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + snippet.length;
  el.focus();
  updateCount();
}

function updateCount() {
  const n = $("text").value.length;
  const editor = $("text");
  editor.style.height = "auto";
  const ceiling = editor.closest(".inline-composer") ? 360 : 560;
  editor.style.height = `${Math.max(230, Math.min(editor.scrollHeight, ceiling))}px`;
  const chunk = config.chunk_size || 500;
  $("charcount").textContent = n.toLocaleString();
  $("reqcount").textContent = Math.max(1, Math.ceil(n / chunk));
  const rate = rateFor($("model").value);
  $("cost").textContent = "~$" + (n / 1e6 * rate).toFixed(4);
}

function updateInstr() {
  const n = $("instruction").value.length;
  $("instrCount").textContent = n;
  $("instrCount").className = n > (config.instruction_max || 100) ? "over" : "";
}

function play(url, name, meta, path, title = "", voice = "") {
  return player.toggle(url, null,
    { name, meta, path, title: title || name || "Audio", voice });
}

function renderHistory(items) {
  const box = $("history");
  box.innerHTML = "";
  $("historyCount").textContent = items.length ? items.length : "";
  if (!items.length) {
    box.innerHTML = '<span class="hint">Nothing yet.</span>';
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item generation-item";

    const b = document.createElement("button");
    b.className = "name";
    // With the database on we can show what was actually said, not just a filename.
    b.innerHTML = item.preview
      ? `<span class="generation-text" dir="auto">${escapeHtml(item.preview)}</span>` +
        `<span class="generation-meta">${item.when} · ` +
        `${escapeHtml(voiceLabel(item.voice))} · ${escapeHtml((item.model || "").toUpperCase())}` +
        `${item.cost ? ` · $${Number(item.cost).toFixed(4)}` : ""}` +
        `${item.failed ? ' · <span style="color:var(--bad)">' + item.failed + ' failed</span>' : ""}</span>`
      : `${item.when} · ${item.name}`;
    b.title = "Load this generation in the player";
    b.onclick = () => play(item.url, item.name,
      `${voiceLabel(item.voice)} · ${item.size_mb} MB · $${Number(item.cost || 0).toFixed(4)}`,
      config.out_dir + "/" + item.name, item.preview || item.name, item.voice);
    row.appendChild(b);

    if (item.id) {
      const details = document.createElement("button");
      details.className = "x";
      details.innerHTML = icon("more");
      details.title = "Open transcript, settings and takes";
      details.onclick = () => openAudio(item.id);
      const reload = document.createElement("button");
      reload.className = "x";
      reload.innerHTML = icon("redo");
      reload.title = "Load this script and its settings back into the editor";
      reload.onclick = () => reloadGeneration(item.id);
      const del = document.createElement("button");
      del.className = "x";
      del.textContent = "×";
      del.title = "Remove from history";
      del.onclick = async () => {
        if (!await ui.confirm("Remove from history?",
              "The audio file stays on disk — only the record goes.", "Remove")) return;
        await partService.remove(item.id);
        refreshHistory();
      };
      row.append(details, reload, del);
    }
    box.appendChild(row);
  }
}

function showInspector(panel = "settings") {
  const history = panel === "history";
  $("composerMore").style.display = history ? "none" : "";
  $("composerHistory").style.display = history ? "" : "none";
  $("inspectorTabs").querySelectorAll("[data-panel]").forEach(button =>
    button.classList.toggle("on", button.dataset.panel === panel));
}

$("inspectorTabs").querySelectorAll("[data-panel]").forEach(button =>
  button.onclick = () => showInspector(button.dataset.panel));

$("translationToggle").onclick = () => {
  const open = $("translationBody").style.display === "none";
  $("translationBody").style.display = open ? "" : "none";
  $("translationToggle").classList.toggle("on", open);
};

/* Emoji rendered differently on every machine and read as clip-art. These are
   one stroke weight, one box, and they inherit the colour around them. */
const ICONS = {
  folder:  '<path d="M2 5.2a1.2 1.2 0 0 1 1.2-1.2h3.1l1.5 1.8h6a1.2 1.2 0 0 1 1.2 1.2v5.8a1.2 1.2 0 0 1-1.2 1.2H3.2A1.2 1.2 0 0 1 2 12.8z"/>',
  inbox:   '<path d="M2 9.5h3.2l1 1.9h3.6l1-1.9H14"/><path d="M3.4 3.4h9.2L14 9.5v3.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5z"/>',
  play:    '<path d="M5 3.5v9l7.5-4.5z"/>',
  pause:   '<path d="M6 3.5v9M10 3.5v9"/>',
  redo:    '<path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M13.8 2.6v3.6h-3.6"/>',
  clock:   '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>',
  up:      '<path d="M8 12.5v-9M4 7l4-3.5L12 7"/>',
  down:    '<path d="M8 3.5v9M4 9l4 3.5L12 9"/>',
  close:   '<path d="M4 4l8 8M12 4l-8 8"/>',
  cc:      '<rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6"/><path d="M7 7.1a1.7 1.7 0 1 0 0 1.8M11.4 7.1a1.7 1.7 0 1 0 0 1.8"/>',
  image:   '<rect x="2" y="3" width="12" height="10" rx="1.6"/><circle cx="5.8" cy="6.4" r="1"/><path d="M2.6 11.6l3.3-3.1 2.4 2.2 2-1.8 3.1 2.7"/>',
  mic:     '<rect x="6" y="1.9" width="4" height="7.6" rx="2"/><path d="M3.6 7.4a4.4 4.4 0 0 0 8.8 0"/><path d="M8 11.8v2.3"/>',
  pencil:  '<path d="M11.1 2.5l2.4 2.4-8 8-3.1.7.7-3.1z"/>',
  copy:    '<rect x="5.4" y="5.4" width="8.2" height="8.2" rx="1.5"/><path d="M10.6 5.4V3.9a1.5 1.5 0 0 0-1.5-1.5H3.9a1.5 1.5 0 0 0-1.5 1.5v5.2a1.5 1.5 0 0 0 1.5 1.5h1.5"/>',
  globe:   '<circle cx="8" cy="8" r="5.9"/><path d="M2.1 8h11.8"/><path d="M8 2.1c1.6 1.7 2.5 3.8 2.5 5.9S9.6 12.2 8 13.9C6.4 12.2 5.5 10.1 5.5 8S6.4 3.8 8 2.1z"/>',
  more:    '<circle cx="8" cy="3.2" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="8" cy="12.8" r="1.1"/>',
  check:   '<path d="M3 8.4l3.4 3.3L13 4.9"/>',
  venture: '<path d="M2.6 13.6V6.4l5.4-3.9 5.4 3.9v7.2"/><path d="M6.3 13.6V9.4h3.4v4.2"/>',
  project: '<rect x="2" y="4.4" width="12" height="8.8" rx="1.6"/><path d="M5.6 4.4V3.2a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.2"/>',
  cog:     '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6l.9 1.6 1.8-.3.5 1.8 1.7.7-.7 1.7.7 1.7-1.7.7-.5 1.8-1.8-.3L8 14.4l-.9-1.6-1.8.3-.5-1.8-1.7-.7.7-1.7-.7-1.7 1.7-.7.5-1.8 1.8.3z"/>',
  stack:   '<path d="M8 1.9l6 3.2-6 3.2-6-3.2z"/><path d="M2.4 8.2L8 11.2l5.6-3M2.4 11.3L8 14.3l5.6-3"/>',
};
function icon(name) {
  return `<svg class="ico-svg" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
/* The three levels, and everything the interface needs to say about each one.
   Defined once so a button, a heading and an error can never disagree. */
const LEVELS = {
  venture: { one: "venture", many: "ventures", icon: "venture",
             holds: "project", holdsMany: "projects",
             blank: "A venture is a business or a brand. Inside it you keep " +
                    "projects — one per channel, show or product." },
  project: { one: "project", many: "projects", icon: "project",
             holds: "production", holdsMany: "productions",
             blank: "A project holds Productions. Each Production is one finished " +
                    "piece — an episode, a video, a guide." },
  folder:  { one: "production", many: "productions", icon: "folder",
             holds: null, holdsMany: "recordings",
             blank: "This is where recordings live. Create speech and it becomes " +
                    "Part 1 of a sequence you can pace with silence and " +
                    "stitch into one file." },
};
const RESOURCE_TYPES = {
  venture: LEVELS.venture,
  project: LEVELS.project,
  production: LEVELS.folder,
  inbox: { one: "inbox", many: "inboxes", icon: "inbox",
           holds: "recording", holdsMany: "recordings",
           blank: "Recordings created without a destination wait here." },
  library: { one: "venture library", many: "venture libraries", icon: "stack",
             holds: "asset collection", holdsMany: "asset collections",
             blank: "Reusable files are organized by their role in this Venture." },
  asset_collection: { one: "asset collection", many: "asset collections", icon: "folder",
                      holds: "file", holdsMany: "files",
                      blank: "Upload reusable audio files here." },
};
const levelOf = project => RESOURCE_TYPES[project?.container_type] ||
  LEVELS[project?.level] || LEVELS.folder;
const isBucket = project => project?.container_type === "inbox";

/* A project's picture: emoji, uploaded image, or the level's own mark. */
function projectBadge(project, cls = "folder-badge") {
  const mark = project.icon || "";
  const isImage = mark.startsWith("/") || mark.startsWith("data:");
  const brand = project.container_type === "venture" && !isBucket(project);
  const inner = isImage
    ? `<img src="${escapeHtml(mark)}" alt="">`
    : brand ? icon("venture")
    : mark ? escapeHtml(mark)
    : icon(isBucket(project) ? "inbox" : levelOf(project).icon);
  return `<span class="${cls}${brand ? " brand-badge" : ""}">${inner}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Put a past job back exactly as it was — text plus every setting. */
async function reloadGeneration(id) {
  const g = await partService.get(id);
  if (g.error) return setStatus("status", g.error, "err");
  $("text").value = g.text;
  $("engine").value = g.engine || "audio";
  $("model").value = g.model;
  fillVoiceSelect();
  if (![...$("voice").options].some(o => o.value === g.voice)) {
    $("voice").insertBefore(new Option(g.voice, g.voice), $("voice").firstChild);
  }
  $("voice").value = g.voice;
  $("format").value = g.format;
  $("language").value = g.language || "Auto";
  $("instruction").value = g.instruction || "";
  $("omniDirection").value = g.instruction || "";
  $("speechMode").value = g.speech_mode || "exact";
  syncSpeechMode();
  $("rate").value = g.rate;   $("rateVal").textContent = g.rate + "×";
  $("pitch").value = g.pitch; $("pitchVal").textContent = g.pitch + "×";
  $("volume").value = g.volume; $("volVal").textContent = g.volume;
  $("seed").value = g.seed;
  updateCount(); updateInstr();
  setStatus("status", "Loaded. Change anything and generate again.", "ok");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshHistory() {
  const q = encodeURIComponent($("historySearch").value.trim());
  const data = await api(`/api/history?q=${q}`);
  renderHistory(data.history || []);
}

let clonedVoices = [];
const clonedVoiceId = voice => voice?.voice_id || voice?.voice || voice;

/* Provider ids are capabilities. This collapses them into the human voice the
   operator created, while keeping every exact id available for routing. */
function clonedIdentityRecords() {
  const grouped = new Map();
  for (const clone of clonedVoices) {
    const id = clonedVoiceId(clone);
    const identity = clone.identity_id || `provider:${voiceKey(id)}`;
    const target = clone.target_model || clone.targetModel || "";
    const tier = clone.tier || (String(target || id).includes("flash") ? "flash" : "plus");
    const engine = clone.engine || (String(id).startsWith("qwen-omni-vc-") ? "omni" : "audio");
    let record = grouped.get(identity);
    if (!record) {
      const usage = clone.identity_usage || {};
      record = {
        ...voiceRecord(id), identity_id: identity, key: identity,
        id, name: clone.name || voiceLabel(id),
        detail: clone.trait || clone.notes || voiceDetail(id),
        image: clone.image || "", gender: clone.gender || "", age: clone.age || "",
        accent: clone.accent || "", scene: clone.scene || "",
        tiers: {}, bindings: [], cloned: true,
        uses: usage.uses || 0, folders: usage.productions || 0,
        spend: usage.spend || 0, last_used: usage.last_used || null,
        preview: usage.preview_filename ? `/audio/${encodeURIComponent(usage.preview_filename)}` : "",
      };
      grouped.set(identity, record);
    }
    record.tiers[tier] = id;
    record.bindings.push({ id, engine, tier, target });
  }
  return [...grouped.values()];
}

function updateComposerRoute() {
  if (!maybe("composerRoute") || !maybe("engine") || !maybe("voice")) return;
  const language = $("language").value || "Auto";
  const engine = $("engine").value === "omni" ? "Qwen 3.5 Omni" : "Qwen Audio";
  const quality = $("model").value === "flash" ? "Flash" : "Plus";
  const voice = voiceLabel($("voice").value || "—");
  const mode = $("engine").value === "omni"
    ? ` · ${$("speechMode").value === "directed" ? "Directed" : "Exact"}` : "";
  $("composerRoute").textContent = `${language} · ${engine} ${quality}${mode} · ${voice}`;
}

function syncSpeechMode() {
  const directed = $("speechMode").value === "directed";
  $("directedControls").style.display = directed ? "" : "none";
  updateComposerRoute();
}

function syncEngineUI() {
  const engine = $("engine").value;
  const capability = config.capabilities?.[engine];
  $("engineNote").textContent = engine === "omni"
    ? "Use this for Arabic and broader multilingual speech. Omni receives one minimal " +
      "verbatim-read request; Audio-only inline tags are removed before generation."
    : "Best for exact-script production, performance instructions and inline sound tags. " +
      "Its cloned-voice contract does not include Arabic.";
  $("playNow").disabled = engine === "omni";
  $("ttsInstructionControls").style.display = engine === "omni" ? "none" : "";
  $("omniModeControls").style.display = engine === "omni" ? "" : "none";
  $("audioPerformanceControls").style.display = engine === "omni" ? "none" : "";
  $("tagToggle").style.display = engine === "omni" ? "none" : "";
  const taggedState = $("textStates").querySelector('[data-state="tagged"]');
  taggedState.disabled = engine === "omni";
  taggedState.title = engine === "omni"
    ? "Tagged scripts belong to Qwen Audio. Omni removes those tags before speaking."
    : "";
  if (engine === "omni") {
    $("tagPanel").style.display = "none";
    $("tagToggle").classList.remove("on");
  }
  if (capability && !capability.models[$("model").value]) $("model").value = "plus";
  fillVoiceSelect();
  updateCount();
  updateComposerRoute();
}

function syncCloneEngine() {
  const engine = $("cloneEngine").value;
  const capability = config.capabilities?.[engine];
  if (!capability) return;
  const language = $("cloneLang").value;
  $("cloneLang").innerHTML = "";
  $("cloneLang").add(new Option("Auto detect", ""));
  for (const [code, name] of Object.entries(capability.clone_languages || {}))
    $("cloneLang").add(new Option(name, code));
  if ([...$("cloneLang").options].some(o => o.value === language))
    $("cloneLang").value = language;
  $("cloneTier").innerHTML = "";
  for (const tier of capability.clone_tiers || [])
    $("cloneTier").add(new Option(
      tier === "plus" ? "Plus — best quality" : "Flash — faster and cheaper", tier));
  $("cloneClean").disabled = engine === "omni";
  $("cloneLen").disabled = engine === "omni";
  $("cloneUpdate").disabled = engine === "omni";
  $("clonePrefix").maxLength = engine === "omni" ? 16 : 9;
  cloneRecorder.updateSteps();
  cloneRecorder.showPassage();
}

/* Voices are tier-specific — a Plus voice is rejected by Flash and vice versa,
   so the dropdown is rebuilt whenever the quality tier changes. */
function fillVoiceSelect() {
  const engine = $("engine").value;
  const tier = $("model").value;
  const modelId = config.capabilities?.[engine]?.models?.[tier] || config.models[tier];
  const select = $("voice");
  const keep = select.value;
  select.innerHTML = "";

  // Show every cloned voice, not just ones matching the current tier. Hiding
  // them was the reason a freshly created voice appeared to vanish — picking
  // one switches the tier instead.
  const mine = clonedIdentityRecords().map(identity => {
    const sameEngine = identity.bindings.filter(binding => binding.engine === engine);
    const binding = sameEngine.find(item => item.tier === tier) || sameEngine[0];
    return binding ? { identity, binding } : null;
  }).filter(Boolean);
  if (mine.length) {
    const group = document.createElement("optgroup");
    group.label = "Your cloned voices";
    for (const { identity, binding } of mine) {
      const id = binding.id;
      const theirTier = binding.tier;
      group.appendChild(new Option(
        `${identity.name} — your voice${theirTier === tier ? "" : ` (${theirTier})`}`, id));
    }
    select.appendChild(group);
  }

  const group = document.createElement("optgroup");
  group.label = engine === "omni" ? "Built in — Omni" :
    (tier === "plus" ? "Built in — Plus" : "Built in — Flash");
  const builtins = engine === "omni"
    ? (config.capabilities?.omni?.system_voices || {})
    : config.voices[tier];
  for (const [id, desc] of Object.entries(builtins)) {
    group.appendChild(new Option(`${id} — ${desc}`, id));
  }
  select.appendChild(group);

  // Keep the current pick only if this tier actually offers it. Otherwise fall
  // back to the voice you chose as your default, and only then to the one the
  // app ships with.
  const mineForTier = engine === "audio" ? defaultVoiceId(tier) : "Tina";
  select.value = [...select.options].some(o => o.value === keep) ? keep
    : (mineForTier && [...select.options].some(o => o.value === mineForTier))
      ? mineForTier
      : (engine === "omni" ? "Tina" : config.default_voice[tier]);
  // The hidden select is the source of truth; the chip is what you look at.
  drawVoicePick();
  updateComposerRoute();
}

/* The Script tab is gone: it was a folder with ordered parts, built a second
   time. Its work now lives in Projects — see db.migrate_scripts. */

/* Alibaba's published catalogue, loaded once from a file we ship. */
let library = [];

/* One shared media engine. Projects and every production tool pass it Tracks;
   transport, waveform and keyboard behavior live in the component itself. */
const player = StudioPlayer.create({
  elements: {
    root: $("globalPlayer"),
    home: $("playerHome"),
    title: $("playerTitle"),
    meta: $("meta"),
    avatar: $("playerAvatar"),
    download: $("download"),
    savedPath: $("savedPath"),
    audio: $("audio"),
    playPause: $("playPause"),
    wave: $("wave"),
    clock: $("playClock"),
    total: $("playTotal"),
    speed: $("playSpeed"),
  },
  renderVoice: voice => voiceAvatar(voice, 34),
  renderIcon: name => icon(name),
  formatTime: seconds => clock(seconds),
  stopSequence: () => stopSequence(),
});

/* Hear a voice's sample. The button keeps whatever it says and only gains a
   stop mark, so "Hear it" never turns into ■ and stays that way. */
function auditionPlay(url, button, details = {}) {
  const label = button.dataset.label || button.textContent;
  button.dataset.label = label;
  player.toggle(url, playing => {
    button.textContent = playing ? "Ⅱ Pause" : label;
  }, details);
}

function stopAudition() { player.stop(); }

/* One catalogue is moved between Voices and consumers such as Composer. The
   feature owns picker state and every dismissal path; this file injects data. */
const voiceBrowser = StudioVoiceBrowser.create({
  get: $,
  ensureLibrary: async () => { if (!library.length) await loadLibrary(); },
  ensureUsage: async () => {
    if (!Object.keys(voiceUsage).length) await loadVoiceUsage();
  },
  getMode: () => voiceMode,
  setMode: value => { voiceMode = value; },
  setTier: value => { voiceFilters.tier = value; },
  draw: () => drawVoices(),
  stopPlayer: () => player.stop(),
});

async function loadLibrary() {
  const registry = await (await fetch("/api/voices/registry")).json();
  library = (registry.bindings || []).filter(binding => binding.source === "system")
    .map(binding => ({
      id: binding.provider_voice_id,
      tier: binding.tier,
      engine: binding.engine,
      name: binding.name,
      trait: binding.description,
      language: (binding.languages || []).join(", "),
      sample: "",
    }));
  buildCatalogue();
  // The old browser's filter selects went with it; the new ones are built from
  // the catalogue each time they are drawn.
}

/* Generating from a part's composer replaces that part, keeping the old take. */
/* ── the states a text passes through ────────────────────────────────────
   Raw is what you pasted. Spoken is what it became for the ear. Tagged is what
   carries delivery marks. All three are kept and stored with the part, so a
   rewrite is never a door that shuts behind you. */
const textStates = { raw: "", shaped: "", tagged: "", showing: "raw" };

function loadStates(part) {
  textStates.raw = (part && part.text_raw) || "";
  textStates.shaped = (part && part.text_shaped) || "";
  const state = (part && part.text_state) || "";
  textStates.tagged = (part && part.text_tagged) ||
                      (state === "tagged" ? (part.text || "") : "");
  textStates.showing = state || "raw";
  if (!textStates.raw && part) textStates.raw = part.text || "";
  drawStates();
}

function drawStates() {
  for (const b of $("textStates").querySelectorAll("[data-state]")) {
    const has = !!textStates[b.dataset.state] ||
                b.dataset.state === textStates.showing;
    b.classList.toggle("on", b.dataset.state === textStates.showing);
    b.classList.toggle("empty", !has);
    b.title = has ? "" : "Nothing here yet";
  }
  // Looking at an older version? Then there's something to go back to.
  const stale = textStates.showing !== currentState();
  $("stateRevert").style.display = stale ? "" : "none";
}

/* Which state the words in the box actually are. */
function currentState() {
  const now = $("text").value;
  if (now && now === textStates.tagged) return "tagged";
  if (now && now === textStates.shaped) return "shaped";
  return "raw";
}

$("textStates").querySelectorAll("[data-state]").forEach(b => b.onclick = () => {
  const wanted = textStates[b.dataset.state];
  if (!wanted && b.dataset.state !== currentState()) {
    return setStatus("status",
      b.dataset.state === "shaped"
        ? "Nothing spoken yet — press \"Make it spoken\" first."
        : "No tagged version yet — add tags below.", "");
  }
  textStates.showing = b.dataset.state;
  if (wanted) $("text").value = wanted;
  updateCount(); refreshTags(); drawStates();
});

$("stateRevert").onclick = () => {
  // Going back is just making this version the live one again.
  const words = textStates[textStates.showing];
  if (!words) return;
  $("text").value = words;
  updateCount(); refreshTags(); drawStates();
  setStatus("status", `Back to the ${textStates.showing} version.`, "ok");
};

/* Run a pass, show what changed, and only then let it in. */
async function textPass(kind) {
  const before = $("text").value.trim();
  if (!before) return setStatus("status", "Nothing to work on yet.", "err");
  const priced = await api("/api/text/estimate", { text: before });
  setStatus("status",
    kind === "shape" ? "Rewriting it for the ear…" : "Placing tags…", "busy");

  const res = await spendGuarded(`/api/text/${kind}`, {
    text: before,
    id: composer.editing ? composer.editing.id : 0,
    project_id: composer.target ? composer.target.id : 0,
    density: $("tagDensity").value,
  }, kind === "shape" ? "Make it spoken" : "Place tags");
  if (res === null) return setStatus("status", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("status", res.error, "err");

  setStatus("status", "", "");
  showDifference(res, kind, priced.cost);
}

function showDifference(res, kind, cost) {
  $("diffTitle").textContent =
    kind === "shape" ? "Rewritten to be spoken" : "Tags placed";
  const changes = (res.difference || []).filter(m => m.kind !== "same").length;
  $("diffNote").textContent =
    `${changes} change${changes === 1 ? "" : "s"} · about $${res.cost}` +
    (res.style_used ? " · your venture's style was used" : "");
  $("diffBody").innerHTML = (res.difference || []).map(m =>
    m.kind === "added" ? `<ins>${escapeHtml(m.text)}</ins>`
    : m.kind === "removed" ? `<del>${escapeHtml(m.text)}</del>`
    : escapeHtml(m.text)).join("");

  $("diffAccept").onclick = async () => {
    $("shapeDiff").close();
    if (kind === "shape") {
      if (!textStates.raw) textStates.raw = res.before;
      textStates.shaped = res.after;
      textStates.showing = "shaped";
    } else {
      textStates.tagged = res.after;
      textStates.showing = "tagged";
    }
    $("text").value = res.after;
    updateCount(); refreshTags(); drawStates();
    await saveStates();
    setStatus("status", `Done — the ${kind === "shape" ? "raw" : "untagged"} ` +
                        `version is still there if you want it back.`, "ok");
  };
  $("diffReject").onclick = () => {
    $("shapeDiff").close();
    setStatus("status", "Left as it was. You still paid for the attempt.", "");
  };
  $("shapeDiff").showModal();
}

/* Keep the states with the part, not just in this screen. */
async function saveStates() {
  const part = composer.editing;
  if (!part) return;
  await api("/api/text/states", {
    id: part.id, text: $("text").value,
    text_raw: textStates.raw || null,
    text_shaped: textStates.shaped || null,
    text_tagged: textStates.tagged || null,
    text_state: currentState(),
  });
}

/* ── editing the instructions ────────────────────────────────────────────
   The prompts are settings, not code. What you save here is what gets sent, and
   the preview shows it with {moods}, {sounds} and {retired} already filled. */
const PROMPT_FIELDS = {
  shape: "promptShape", tag: "promptTag", style_line: "promptStyleLine",
  density_light: "promptDensityLight", density_normal: "promptDensityNormal",
  density_heavy: "promptDensityHeavy",
};
let promptDefaults = {};

async function loadPromptEditor() {
  const data = await api("/api/text/prompts?id=0");
  promptDefaults = data.defaults || {};
  $("promptModel").textContent = data.model || "the model";
  for (const [key, field] of Object.entries(PROMPT_FIELDS)) {
    $(field).value = (data.templates || {})[key] || "";
    $(field).placeholder = promptDefaults[key] || "";
  }
  drawPromptPreview();
}

function drawPromptPreview() {
  const which = $("editPromptTabs").querySelector("button.on").dataset.edit;
  const values = config.tag_variables || {};
  const fill = text => Object.entries(values)
    .reduce((out, [k, v]) => out.split("{" + k + "}").join(v), text || "");
  $("promptPreview").textContent =
    which === "shape" ? fill($("promptShape").value)
    : which === "tag"
      ? fill($("promptTag").value).split("{density}").join($("promptDensityNormal").value)
      : [$("promptDensityLight").value, $("promptDensityNormal").value,
         $("promptDensityHeavy").value].join("\n\n");
}

$("editPromptTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
  $("editPromptTabs").querySelectorAll("button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  $("editShape").style.display = b.dataset.edit === "shape" ? "" : "none";
  $("editTag").style.display = b.dataset.edit === "tag" ? "" : "none";
  $("editDensities").style.display = b.dataset.edit === "densities" ? "" : "none";
  drawPromptPreview();
});
Object.values(PROMPT_FIELDS).forEach(field =>
  $(field).addEventListener("input", drawPromptPreview));

$("promptsSave").onclick = async () => {
  const prompts = {};
  for (const [key, field] of Object.entries(PROMPT_FIELDS)) {
    const words = $(field).value.trim();
    // Blank means "use the original", so nothing is stored for it.
    if (words && words !== promptDefaults[key]) prompts[key] = words;
  }
  const res = await api("/api/prompts/save", { prompts });
  if (res.error) return setStatus("promptsStatus", res.error, "err");
  setStatus("promptsStatus",
    Object.keys(prompts).length
      ? `Saved — ${Object.keys(prompts).length} of your instruction` +
        `${Object.keys(prompts).length === 1 ? " is" : "s are"} used from now on.`
      : "Back on the originals — nothing of yours is stored.", "ok");
};

$("promptsReset").onclick = async () => {
  if (!await ui.confirm("Back to the original instructions?",
        "Anything you wrote here is cleared. Your venture styles are separate " +
        "and are not touched.", "Reset")) return;
  await api("/api/prompts/save", { prompts: {} });
  await loadPromptEditor();
  setStatus("promptsStatus", "Back to the originals.", "ok");
};

/* The prompts are shown, not described. A rewrite you cannot inspect is a
   black box, and you would be right not to trust it. */
let prompts = null;

async function showPrompts(kind = "shape") {
  prompts = await api(`/api/text/prompts?id=${composer.target ? composer.target.id : 0}`);
  $("promptWhich").textContent =
    `Sent to ${prompts.model}` +
    (prompts.style ? ` · your venture's style is appended at the end`
                   : ` · no venture style set, so nothing is appended`);
  $("promptTabs").querySelectorAll("button").forEach(b => {
    b.classList.toggle("on", b.dataset.kind === kind);
    b.onclick = () => showPrompts(b.dataset.kind);
  });
  $("promptText").textContent =
    kind === "shape" ? prompts.shape : prompts.tag[kind];
  if (!$("promptDialog").open) $("promptDialog").showModal();
}

$("showPrompt").onclick = () => showPrompts($("tagDensity").value);
$("promptClose").onclick = () => $("promptDialog").close();

$("shapeGo").onclick = () => textPass("shape");
$("tagWithAI").onclick = () => textPass("tag");

/* What a pass would cost, before you press anything. */
let costTimer;
$("text").addEventListener("input", () => {
  clearTimeout(costTimer);
  costTimer = setTimeout(async () => {
    const words = $("text").value.trim();
    if (!words) return $("textPassCost").textContent = "";
    const res = await api("/api/text/estimate", { text: words });
    $("textPassCost").textContent = `about $${res.cost} a pass`;
  }, 500);
});

/* Everything the composer currently holds, as a settings payload. */
/* Keep the tag panel honest about what's currently in the text: which tags are
   in use, how many, and whether anything unrecognised is in there — an invented
   tag gets read out loud, so it has to be visible before you spend. */
function refreshTags() {
  const text = $("text").value;
  const used = [...text.matchAll(/\[([^\[\]]{1,40})\]/g)].map(m => m[1]);
  const known = new Set(Object.keys(config.tags.Moods || {})
                        .concat(Object.keys(config.tags.Sounds || {})));
  const retired = config.retired_tags || {};
  const good = used.filter(t => known.has(t.toLowerCase()));
  // A retired tag still works — we simply stopped offering it. Marking it as
  // invented would be a lie, and five of your parts already contain one.
  const old = [...new Set(used.filter(t => t.toLowerCase() in retired))];
  const bad = [...new Set(used.filter(t =>
    !known.has(t.toLowerCase()) && !(t.toLowerCase() in retired)))];

  $("tags").querySelectorAll(".chip[data-tag]").forEach(chip =>
    chip.classList.toggle("in-use",
      good.some(t => t.toLowerCase() === chip.dataset.tag)));

  const label = $("tagCount");
  if (bad.length) {
    label.innerHTML = `<b style="color:var(--bad)">` +
      `${bad.map(escapeHtml).join(", ")}</b> ` +
      `${bad.length === 1 ? "isn't a real tag and will be read out loud"
                          : "aren't real tags and will be read out loud"}`;
  } else if (old.length) {
    label.innerHTML = `<b style="color:var(--warn)">${old.map(escapeHtml).join(", ")}</b> ` +
      `still works, but we stopped offering it — ` +
      `${escapeHtml(retired[old[0].toLowerCase()] || "")}`;
  } else {
    label.textContent = good.length
      ? `${good.length} tag${good.length === 1 ? "" : "s"} in this part`
      : "none in this part";
  }
  $("tagClear").style.display = used.length ? "" : "none";
  // The button carries the state, so you can see there are tags without
  // opening the panel — and the warning colour survives a collapsed panel.
  $("tagToggle").textContent =
    "Tags" + (good.length + old.length ? ` (${good.length + old.length})` : "") +
    (bad.length ? " !" : "");
  $("tagToggle").classList.toggle("warn", bad.length > 0);
  $("tagToggle").title = bad.length
    ? `${bad.join(", ")} — not a real tag, it will be read out loud`
    : good.length ? `${good.length} tag${good.length === 1 ? "" : "s"} in this part`
    : "Add emotion and sound tags to the text";
}

$("tagClear").onclick = () => {
  $("text").value = $("text").value
    .replace(/\[([^\[\]]{1,40})\]\s*/g, "").replace(/\s{2,}/g, " ").trim();
  updateCount(); refreshTags(); $("text").focus();
};
$("text").addEventListener("input", refreshTags);

function composerSettings() {
  const omni = $("engine").value === "omni";
  return {
    text: $("text").value,
    voice: $("voice").value,
    engine: $("engine").value,
    model: $("model").value,
    format: $("format").value,
    instruction: omni ? $("omniDirection").value : $("instruction").value,
    speech_mode: omni ? $("speechMode").value : "exact",
    language: $("language").value === "Auto" ? "" : $("language").value,
    rate: parseFloat($("rate").value),
    pitch: parseFloat($("pitch").value),
    volume: parseInt($("volume").value, 10),
    seed: parseInt($("seed").value, 10) || 0,
  };
}

function captureComposerSession() {
  return {
    settings: composerSettings(),
    languageValue: $("language").value,
    statusText: $("status").textContent,
    statusClass: $("status").className,
    inspectorPanel: $("composerHistory").style.display === "none" ? "settings" : "history",
    states: { ...textStates },
  };
}

function restoreComposerSession(session) {
  if (!session) return;
  const value = session.settings;
  $("text").value = value.text || "";
  $("engine").value = value.engine || "audio";
  $("model").value = value.model || "plus";
  syncEngineUI();
  if (value.voice && ![...$("voice").options].some(o => o.value === value.voice))
    $("voice").insertBefore(new Option(value.voice, value.voice), $("voice").firstChild);
  $("voice").value = value.voice || $("voice").value;
  $("format").value = value.format || "mp3";
  $("language").value = session.languageValue || "Auto";
  $("instruction").value = value.instruction || "";
  $("omniDirection").value = value.instruction || "";
  $("speechMode").value = value.speech_mode || "exact";
  syncSpeechMode();
  $("rate").value = value.rate ?? 1; $("rateVal").textContent = `${value.rate ?? 1}×`;
  $("pitch").value = value.pitch ?? 1; $("pitchVal").textContent = `${value.pitch ?? 1}×`;
  $("volume").value = value.volume ?? 50; $("volVal").textContent = value.volume ?? 50;
  $("seed").value = value.seed ?? 0;
  Object.assign(textStates, session.states || { raw: "", shaped: "", tagged: "", showing: "raw" });
  drawStates(); drawVoicePick(); updateCount(); updateInstr(); refreshTags(); updateComposerRoute();
  $("status").textContent = session.statusText || "";
  $("status").className = session.statusClass || "status";
  showInspector(session.inspectorPanel || "settings");
}

/* Write a part down without recording it. Nothing is sent to the model, so
   nothing is charged — the part appears in the sequence as a draft. */
$("saveDraft").onclick = async () => {
  const text = $("text").value.trim();
  if (!text) return setStatus("status", "Write something first.", "err");
  const project = composer.target;   // null means Unsorted, same as a recording
  const editing = composer.editing;
  const res = await partService.draft({
    ...composerSettings(),
    project_id: project ? project.id : undefined,
    id: editing && editing.kind === "draft" ? editing.id : undefined,
    insert_at: editing ? undefined : composer.at,
  });
  if (res.error) return setStatus("status", res.error, "err");
  const note = editing
    ? "Draft saved. Nothing was charged."
    : `Saved as a draft in ${project ? `"${project.name}"` : "Unsorted"} — ` +
      `record it whenever you're ready. Nothing charged.`;
  composer.home();
  if (project) { await showProject(project.id); setStatus("projectStatus", note, "ok"); }
  else { setStatus("status", note, "ok"); $("text").value = ""; updateCount(); refreshTags(); }
};

/* Turn one draft into audio. */
async function recordDraft(part) {
  setStatus("status", "Recording this part…", "busy");
  watchProgress("status");
  const res = await partService.render(part.id, composerSettings());
  stopWatchingProgress();
  $("go").disabled = false;
  $("go").textContent = "Record it now";
  if (res === null) return setStatus("status", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("status", res.error, "err");
  const project = composer.target;
  composer.home();
  if (project) await showProject(project.id);
  setRendered("projectStatus", `Recorded — $${res.cost}.`, res.warning);
}

async function finishTake() {
  const part = composer.editing;
  setStatus("status", "Making another take…", "busy");
  watchProgress("status");
  const res = await partService.regenerate({
    id: part.id, text: $("text").value, voice: $("voice").value,
    engine: $("engine").value,
    model: $("model").value, format: $("format").value,
    instruction: $("engine").value === "omni" ? $("omniDirection").value : $("instruction").value,
    speech_mode: $("engine").value === "omni" ? $("speechMode").value : "exact",
    language: $("language").value === "Auto" ? "" : $("language").value,
    rate: parseFloat($("rate").value), pitch: parseFloat($("pitch").value),
    volume: parseInt($("volume").value, 10),
    seed: parseInt($("seed").value, 10) || 0,
  });
  stopWatchingProgress();
  $("go").disabled = false;
  $("go").textContent = "Make this take";
  if (res === null) return setStatus("status", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("status", res.error, "err");
  const project = composer.target;
  composer.home();
  if (project) await showProject(project.id);
  setRendered("projectStatus",
    `New take made — ${res.takes} older take${res.takes === 1 ? "" : "s"} kept. ` +
    `$${res.cost}.`, res.warning);
}

$("composerX").onclick = () => composer.home();
$("projectComposerX").onclick = () => composer.home();
$("composerDialog").addEventListener("cancel", () => composer.home());

$("moreToggle").onclick = () => {
  showInspector("settings");
  if (composer.target) $("projectComposerInline").classList.toggle("show-settings");
  $("composerMore").scrollIntoView({ block: "nearest", behavior: "smooth" });
};
$("composerRoute").onclick = () => {
  showInspector("settings");
  if (composer.target) $("projectComposerInline").classList.add("show-settings");
  $("composerMore").scrollIntoView({ block: "nearest", behavior: "smooth" });
};

$("voicePick").onclick = () => voiceBrowser.pick({
  title: "Who says this?",
  note: "Click a voice to hear it, or open one for everything about it. " +
        "Choosing sets the quality it speaks at.",
  onChoose: () => {},
});
$("browseVoices").onclick = () => $("voicePick").click();
$("voice").addEventListener("change", drawVoicePick);

let voiceImageFor = null;

/* Upload a picture for one voice. Called from the voice catalogue, and from
   the composer for whichever voice is currently chosen. */
function pickVoiceImage(voice) {
  voiceImageFor = voice;
  $("voiceImageFile").click();
}

$("voiceImageFile").onchange = async () => {
  const file = $("voiceImageFile").files[0];
  if (!file) return;
  const res = await mediaService.uploadImage(file);
  $("voiceImageFile").value = "";
  if (res.error) return setStatus("status", res.error, "err");
  const voice = voiceKey(voiceImageFor || $("voice").value);
  await api("/api/voice/save", { id: voice, image: res.url });
  config.voice_images = { ...(config.voice_images || {}), [voice]: res.url };
  voiceMeta[voice] = { ...(voiceMeta[voice] || {}), image: res.url };
  drawVoicePick();
  if (voicePicked) showVoice(voicePicked);
  if (openProject) renderParts(openProject.parts || []);
};

/* The action button carries one job; the alternatives live behind its caret. */
$("goMore").onclick = event => {
  event.stopPropagation();
  document.querySelectorAll(".go-menu").forEach(m => m.remove());
  if ($("goMore").dataset.open === "1") { delete $("goMore").dataset.open; return; }
  $("goMore").dataset.open = "1";
  const menu = document.createElement("div");
  menu.className = "go-menu";
  const options = [
    ["Hear it first", "Plays immediately, saves nothing", () => $("playNow").click()],
  ];
  if (!$("saveDraft").hidden || composer.target || !composer.editing) {
    options.push(["Save as a draft", "Keeps the words and settings, costs nothing",
                  () => $("saveDraft").click()]);
  }
  for (const [label, note, run] of options) {
    const item = document.createElement("button");
    item.innerHTML = `${label}<small>${note}</small>`;
    item.onclick = () => { menu.remove(); delete $("goMore").dataset.open; run(); };
    menu.appendChild(item);
  }
  $("goMore").parentElement.appendChild(menu);
};
document.addEventListener("click", () => {
  document.querySelectorAll(".go-menu").forEach(m => m.remove());
  const more = document.getElementById("goMore");
  if (more) delete more.dataset.open;
});


/* ── voices tab ───────────────────────────────────────────────────────── */
async function loadCloned() {
  const box = $("clonedList");
  box.innerHTML = '<span class="hint">Loading…</span>';
  const data = await api("/api/voices/cloned");
  if (data.error) { box.innerHTML = `<span class="hint">${data.error}</span>`; return; }
  clonedVoices = data.voices || [];
  const voices = clonedVoices;
  box.innerHTML = "";
  if (!voices.length) {
    box.innerHTML = '<span class="hint">None yet — clone one on the left.</span>';
  }
  for (const v of voices) {
    const id = v.voice_id || v.voice || v;
    const engine = v.engine || "audio";
    const target = v.target_model || v.targetModel || "";
    const row = document.createElement("div");
    row.className = "item";
    const use = document.createElement("button");
    use.className = "name";
    use.textContent = voiceLabel(id);
    use.title = "Use this voice";
    use.onclick = () => {
      // A cloned voice only runs on the tier it was created for.
      $("engine").value = engine;
      $("model").value = String(target || id).includes("flash") ? "flash" : "plus";
      syncEngineUI();
      fillVoiceSelect();
      $("voice").value = id;
      updateCount();
      document.querySelector('nav button[data-tab="speak"]').click();
    };
    const info = document.createElement("button");
    info.className = "x";
    info.textContent = "ⓘ";
    info.title = "What this voice is";
    info.style.display = engine === "omni" ? "none" : "";
    info.onclick = async () => {
      setStatus("cloneStatus", "Looking it up…", "busy");
      const res = await api(`/api/clone/query?id=${encodeURIComponent(id)}`);
      if (res.error) return setStatus("cloneStatus", res.error, "err");
      setStatus("cloneStatus", `${id}: ${JSON.stringify(res.voice)}`, "");
    };

    const del = document.createElement("button");
    del.className = "x";
    del.textContent = "×";
    del.title = "Delete this voice";
    del.onclick = async () => {
      if (!await ui.confirm("Delete this cloned voice?",
            `"${id}" is removed from Alibaba and can't be recovered.`)) return;
      const res = await api("/api/clone/delete", { voice_id: id, engine });
      if (res.error) setStatus("cloneStatus", res.error, "err"); else {
        localStorage.setItem("vorvn:voices-revision", String(Date.now()));
        loadCloned();
      }
    };
    row.append(use, info, del);
    box.appendChild(row);
  }
  fillVoiceSelect();
}

const cloneRecorder = StudioVoiceCloneRecorder.create({
  get: $, setStatus, player,
  audioTrigger: StudioAudioTrigger, fileDrop: StudioFileDrop,
});

$("cloneGo").onclick = async () => {
  const btn = $("cloneGo");
  btn.disabled = true;
  setStatus("cloneStatus", "Creating the voice…", "busy");
  const data = await api("/api/clone/create", {
    url: $("cloneUrl").value,
    reference_id: $("cloneUrl").dataset.referenceId || null,
    prefix: $("clonePrefix").value,
    language: $("cloneLang").value || null,
    max_length: parseFloat($("cloneLen").value),
    clean_up: !!$("cloneClean").value,
    engine: $("cloneEngine").value,
    model: $("cloneTier").value,
    display_name: $("cloneName").value.trim() || $("clonePrefix").value,
    gender: $("cloneGender").value || null,
    age: parseInt($("cloneAge").value, 10) || null,
    trait: $("cloneTrait").value.trim() || null,
    scene: $("cloneScene").value.trim() || null,
  });
  btn.disabled = false;
  if (data.error) return setStatus("cloneStatus", data.error, "err");

  // The description goes in straight away, so the voice is a citizen of the
  // catalogue from the moment it exists rather than an id with nothing on it.
  const saved = await api("/api/voice/save", {
    id: data.voice_id,
    name: $("cloneName").value.trim() || $("clonePrefix").value,
    gender: $("cloneGender").value || null,
    age: parseInt($("cloneAge").value, 10) || null,
    trait: $("cloneTrait").value.trim() || null,
    scene: $("cloneScene").value.trim() || null,
    languages: $("cloneLang").value || null,
    provider_voice_id: data.voice_id,
    engine: data.engine,
    target_model: data.target_model,
    provider_status: "OK",
  });

  if (saved.error || data.warning)
    setStatus("cloneStatus", data.warning || saved.error, "err");
  else
    setStatus("cloneStatus", "Made it — hear it below, or open it in My voices.", "ok");
  localStorage.setItem("vorvn:voices-revision", String(Date.now()));
  await loadCloned(); await loadVoiceUsage();
  $("engine").value = data.engine;
  $("model").value = $("cloneTier").value;
  fillVoiceSelect();
  $("voice").value = data.voice_id;
  drawVoicePick();
  updateCount();

  // Hear what you actually got, without leaving for another tab.
  $("cloneHearWrap").style.display = "";
  $("cloneHear").onclick = async () => {
    setStatus("cloneStatus", "Saying a line…", "busy");
    const heard = await spendGuarded("/api/voice/try", {
      text: "This is how I sound. Let me read you something.",
      voice: data.voice_id, engine: data.engine, model: $("cloneTier").value,
    }, "Hear the new voice");
    if (heard === null) return setStatus("cloneStatus", "Cancelled.", "");
    if (heard.error) return setStatus("cloneStatus", heard.error, "err");
    setStatus("cloneStatus", `Played — $${heard.cost}.`, "ok");
    player.toggle(heard.url, playing =>
      $("cloneHear").textContent = playing ? "Ⅱ Pause" : "Hear the new voice",
      { name: heard.name || "new-voice-preview", title: "New cloned voice",
        meta: `${voiceLabel(data.voice_id)} · clone test`, voice: data.voice_id });
  };

  cloneRecorder.discard();
  $("cloneUrl").value = "";
  delete $("cloneUrl").dataset.referenceId;
  cloneRecorder.updateSteps();
};

/* Which source you're using. Three tabs, one visible at a time. */
$("cloneSourceTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
  $("cloneSourceTabs").querySelectorAll("button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  for (const kind of ["record", "file", "url"]) {
    $("cloneSource" + kind[0].toUpperCase() + kind.slice(1))
      .style.display = b.dataset.source === kind ? "" : "none";
  }
});

/* Let Qwen listen to the reference and propose the description. */
$("cloneSuggest").onclick = async () => {
  const url = $("cloneUrl").value.trim();
  if (!url) return setStatus("cloneStatus",
    "Record, upload or paste the reference audio first.", "err");
  setStatus("cloneStatus", "Qwen is listening…", "busy");
  const res = await spendGuarded("/api/voice/describe", { url }, "Describe a voice");
  if (res === null) return setStatus("cloneStatus", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("cloneStatus", res.error, "err");
  const found = res.suggestion || {};
  if (found.gender) $("cloneGender").value = found.gender;
  if (found.age) $("cloneAge").value = found.age;
  if (found.trait) $("cloneTrait").value = found.trait;
  if (found.scene) $("cloneScene").value = found.scene;
  setStatus("cloneStatus",
    "That's what it heard — change anything it got wrong.", "ok");
};

$("cloneUpdate").onclick = async () => {
  const url = $("cloneUrl").value.trim();
  if (!url) {
    return setStatus("cloneStatus",
      "Record or upload the new audio first, then press this.", "err");
  }
  const mine = clonedVoices.filter(v => (v.engine || "audio") === "audio")
    .map(v => v.voice_id || v.voice || v);
  if (!mine.length) {
    return setStatus("cloneStatus",
      "You have no cloned voices yet — use Create a new voice.", "err");
  }
  const chosen = await ui.ask({
    title: "Replace an existing voice",
    body: "The new recording takes over this voice. Anything already using it " +
          "keeps working, and no extra slot is used.",
    choiceLabel: "Which voice",
    choices: mine.map(id => ({ value: id, label: id })),
    ok: "Replace it",
  });
  if (!chosen) return;

  setStatus("cloneStatus", `Replacing the audio behind ${chosen}…`, "busy");
  const res = await api("/api/clone/update", {
    voice_id: chosen,
    url,
    reference_id: $("cloneUrl").dataset.referenceId || null,
    engine: "audio",
  });
  if (res.error) return setStatus("cloneStatus", res.error, "err");
  setStatus("cloneStatus",
    `Done — ${chosen} now uses the new recording. No extra slot used.`, "ok");
  loadCloned();
};

$("reloadCloned").onclick = loadCloned;

const batchController = StudioBatch.create({
  get: $, setStatus, escapeHtml, spendGuarded, watchProgress,
  stopWatchingProgress, play,
  loadSpend: () => activityController.loadSpend(),
  fileDrop: StudioFileDrop,
});

const multilingualController = StudioMultilingual.create({
  get: $, api, setStatus, escapeHtml, rateFor, spendGuarded,
  watchProgress, stopWatchingProgress, play,
  outDir: () => config.out_dir, refreshHistory,
  loadSpend: () => activityController.loadSpend(),
});

const subtitlesController = StudioSubtitles.create({
  get: $, api, setStatus, escapeHtml, player, ui,
  audioTrigger: StudioAudioTrigger, fileDrop: StudioFileDrop,
});

const activityController = StudioActivity.create({
  get: $, api, escapeHtml,
  voiceLabel: voice => voiceLabel(voice),
  // Keep the composition root order-independent. These formatters are defined
  // with the Projects and Takes domains later in this file; pass closures so
  // creating Activity does not read either const inside its temporal dead zone.
  clock: seconds => clock(seconds),
  stamp: when => stamp(when),
  openAudio: id => openAudio(id),
});

/* A job over the warn threshold comes back asking to be confirmed. Re-send it
   with confirmed:true once the user agrees. Returns null if they decline. */
async function spendGuarded(path, body, describe) {
  return apiClient.spendGuarded(path, body, describe);
}

/* One movable Composer session. Projects supplies context; this feature owns
   destination/editing state and the transition back to Speak. */
const composer = StudioComposer.create({
  get: $,
  captureSession: captureComposerSession,
  restoreSession: restoreComposerSession,
  syncEngine: syncEngineUI,
  syncSpeechMode,
  loadStates,
  drawVoice: drawVoicePick,
  updateCount,
  updateInstruction: updateInstr,
  updateRoute: updateComposerRoute,
  clearStatus: () => setStatus("status", "", ""),
  refreshTags,
  showInspector,
  nextPartNumber,
  getOpenProject: () => openProject,
  refreshOpenProject: parts => renderParts(parts),
});

function nextPartNumber(project) {
  return (project?.parts || []).filter(part => part.kind !== "stitch").length + 1;
}

/* ── projects: folders holding numbered parts ─────────────────────────── */
let openProject = null;      // whatever you generate lands here
let projectTree = [];
let projectModel = ProjectCore.hierarchy();
let projectRequest = 0;      // prevents a slow, older folder from replacing a newer one
let explorerPreference = localStorage.getItem("projectsExplorerCollapsed");

function setProjectExplorer(collapsed, { remember = true } = {}) {
  $("tab-projects").classList.toggle("explorer-collapsed", collapsed);
  $("projectExplorerToggle").setAttribute("aria-expanded", String(!collapsed));
  $("projectExplorerToggle").textContent = collapsed ? "☰ Explorer" : "← Hide explorer";
  $("projectExplorerBackdrop").hidden = collapsed ||
    !window.matchMedia("(max-width: 940px)").matches;
  if (remember) {
    explorerPreference = collapsed ? "1" : "0";
    localStorage.setItem("projectsExplorerCollapsed", explorerPreference);
  }
}

function closeProjectPanel() {
  $("projectProduction").classList.remove("open");
  $("projectProduction").setAttribute("aria-hidden", "true");
  $("projectPanelBackdrop").hidden = true;
}

function openProjectPanel(section = "top") {
  if ($("projectProduction").hidden) return;
  $("projectProduction").classList.add("open");
  $("projectProduction").setAttribute("aria-hidden", "false");
  $("projectPanelBackdrop").hidden = false;
  const panel = $("projectProduction");
  panel.scrollTo({
    top: section === "music" ? Math.max(0, $("musicBlock").offsetTop - 76) : 0,
    behavior: "smooth",
  });
}

$("projectExplorerToggle").onclick = () =>
  setProjectExplorer(!$("tab-projects").classList.contains("explorer-collapsed"));
$("projectExplorerClose").onclick = () => setProjectExplorer(true);
$("projectExplorerBackdrop").onclick = () => setProjectExplorer(true);
$("projectPanelToggle").onclick = () => openProjectPanel();
$("projectPanelClose").onclick = closeProjectPanel;
$("projectPanelBackdrop").onclick = closeProjectPanel;

const projectViews = ProjectHierarchyViews.create({
  levelOf, isBucket, projectBadge, icon, escapeHtml,
});

const secondsFrom = bytes => bytes / 16000;   // rough, for a 128kbps mp3
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/* Which branches are open. Hundreds of projects can't all be on screen, so
   everything starts closed except the path to wherever you are. */
const expanded = new Set(JSON.parse(localStorage.getItem("openBranches") || "[]"));
const rememberBranches = () =>
  localStorage.setItem("openBranches", JSON.stringify([...expanded]));

function treeRow(p, depth, hasKids, { showPath = false } = {}) {
  return projectViews.rail(p, {
    depth,
    hasKids,
    expanded: expanded.has(p.id),
    active: openProject?.id === p.id,
    showPath,
    path: pathOf(p),
    onOpen: project => showProject(project.id),
    onToggle: project => {
      expanded.has(project.id) ? expanded.delete(project.id) : expanded.add(project.id);
      rememberBranches();
      loadProjectTree();
    },
  });
}

async function loadProjectTree() {
  const data = await projectService.list();
  projectTree = data.projects || [];
  projectModel = ProjectCore.hierarchy(projectTree);
  const query = $("treeSearch").value.trim().toLowerCase();
  const box = $("projectTree");
  box.innerHTML = "";

  if (query) {
    // Searching flattens the tree — showing hierarchy while filtering it hides
    // the very matches you're looking for.
    const hits = projectModel.search(query);
    $("treeRecent").innerHTML = "";
    if (!hits.length) {
      box.innerHTML = '<span class="hint">Nothing matches.</span>';
    } else {
      hits.forEach(p => box.appendChild(treeRow(p, 0, false, { showPath: true })));
    }
  } else {
    // The tree is the navigator. A second "recent" copy made dense workspaces
    // shorter and produced duplicate, truncated folder names.
    $("treeRecent").innerHTML = "";
    const render = (parent, depth) => {
      for (const p of projectModel.childrenOf(parent)) {
        const kids = projectModel.childrenOf(p.id);
        box.appendChild(treeRow(p, depth, kids.length > 0));
        if (kids.length && expanded.has(p.id)) render(p.id, depth + 1);
      }
    };
    render(null, 0);
  }

}

let treeSearchTimer;
$("treeSearch").addEventListener("input", () => {
  clearTimeout(treeSearchTimer);
  treeSearchTimer = setTimeout(loadProjectTree, 180);
});
// The shell controls Explorer visibility. The tree itself stays expanded so
// opening the drawer always reveals navigation rather than another disclosure.
$("projectBrowser").open = true;

function sectionHeading(title, note) {
  const el = document.createElement("h3");
  el.className = "block-heading";
  el.innerHTML = `${escapeHtml(title)}<span>${escapeHtml(note || "")}</span>`;
  el.style.marginTop = "18px";
  return el;
}

/* Containment is shared; presentation is not. A brand, a production and a
   finished piece answer different questions at first glance. */
function hierarchyCard(p) {
  const kids = projectModel.childrenOf(p.id);
  const renderer = p.level === "venture" && !isBucket(p)
    ? projectViews.ventureCard
    : p.level === "project" ? projectViews.projectCard
    : projectViews.folderCard;
  return renderer(p, {
    children: kids,
    path: pathOf(p),
    onOpen: project => showProject(project.id),
    onSettings: project => openSettings(project.id),
  });
}

/* Home — every project with its numbers, no picking blind. */
async function showHome({ historyMode = "push" } = {}) {
  projectRequest += 1;
  openProject = null;
  if (composer.target) composer.home();
  $("noProject").style.display = "";
  $("projectPane").style.display = "none";
  $("projectNewTop").style.display = "none";
  $("projectsShellContext").textContent = "All ventures";
  closeProjectPanel();
  if (explorerPreference === null)
    setProjectExplorer(window.innerWidth < 940, { remember: false });
  window.scrollTo(0, 0);
  if (!applyingLocationRoute)
    ProjectCore.writeRoute({ tab: "projects" }, historyMode);
  await loadProjectTree();

  const grid = $("homeGrid");
  grid.innerHTML = "";
  // Ventures are the businesses. Unsorted isn't one — it's the pile that
  // catches anything made without choosing a place — so it sits on its own.
  // Sandbox sorts last among ventures: it's always there, but it isn't work.
  const ventures = projectModel.childrenOf(null)
    .filter(p => p.level === "venture" && !isBucket(p))
    .sort((a, b) => (a.locked - b.locked) || a.name.localeCompare(b.name));
  const bucket = projectModel.childrenOf(null).find(isBucket);

  grid.appendChild(sectionHeading("Your ventures",
    `${ventures.length} venture${ventures.length === 1 ? "" : "s"}`));
  if (ventures.length) {
    const wrap = document.createElement("div");
    wrap.className = "grid";
    for (const venture of ventures) wrap.appendChild(hierarchyCard(venture));
    grid.appendChild(wrap);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<b>No ventures yet</b>" + LEVELS.venture.blank;
    grid.appendChild(empty);
  }

  if (bucket) {
    grid.appendChild(sectionHeading("Not filed anywhere",
      `${bucket.all_parts} part${bucket.all_parts === 1 ? "" : "s"}`));
    const wrap = document.createElement("div");
    wrap.className = "grid";
    wrap.appendChild(hierarchyCard(bucket));
    grid.appendChild(wrap);
  }
}

async function showProject(id, { historyMode = "push" } = {}) {
  const request = ++projectRequest;
  const previousId = openProject?.id;
  const data = await projectService.get(id);
  if (request !== projectRequest) return;
  if (data.error) return setStatus("projectStatus", data.error, "err");
  openProject = data;
  closeProjectPanel();
  if (!applyingLocationRoute)
    ProjectCore.writeRoute({ tab: "projects", projectId: data.id },
      previousId === data.id ? "replace" : historyMode);
  $("noProject").style.display = "none";
  $("projectPane").style.display = "";
  const viewLevel = data.bucket ? "inbox" : data.level;
  const overviewClass = {
    venture: "venture-overview", project: "operational-overview",
    folder: "folder-overview", inbox: "inbox-overview",
  }[viewLevel];
  $("projectPane").dataset.level = viewLevel;
  $("projectsShellContext").textContent = pathOf(data) || data.name;
  $("projectOverview").className = `card project-overview ${overviewClass}`;
  $("projectNewTop").style.display = "none";
  if (explorerPreference === null)
    setProjectExplorer(data.container_type === "production" || window.innerWidth < 940,
      { remember: false });
  if (previousId !== data.id) window.scrollTo(0, 0);
  $("projectName").value = data.name;
  $("projectDesc").value = data.description || "";
  growDesc();
  const brand = data.level === "venture" && !data.bucket;
  const imageIcon = (data.icon || "").startsWith("/") ||
                    (data.icon || "").startsWith("data:");
  $("projectIcon").classList.toggle("brand-logo", brand);
  $("projectIcon").innerHTML = imageIcon
    ? `<img src="${escapeHtml(data.icon)}" alt="">`
    : brand ? icon("venture")
    : data.icon ? escapeHtml(data.icon) : icon("image");
  $("projectIcon").title = brand ? "Upload or change the venture logo"
    : data.icon ? "Change this project's picture"
    : "Give this project an emoji or an image";

  // breadcrumb — clicking a step walks back up
  const crumbs = [{ id: "home", name: "All ventures" },
                  ...data.trail, { id: data.id, name: data.name }];
  $("crumbs").innerHTML = crumbs.map((c, i) => {
    const known = projectModel.byId.get(Number(c.id));
    const what = known ? levelOf(known).one : "";
    return i === crumbs.length - 1
      ? `<b dir="auto" style="color:var(--text)" title="${what}">${escapeHtml(c.name)}</b>`
      : `<a href="${ProjectCore.href({ tab: "projects",
          projectId: c.id === "home" ? null : Number(c.id) })}" ` +
        `data-go="${c.id}" title="${what}" ` +
        `dir="auto" style="color:var(--accent-2)">${escapeHtml(c.name)}</a>`;
  }).join(' <span style="opacity:.5">›</span> ');
  $("crumbs").querySelectorAll("[data-go]").forEach(a =>
    a.onclick = e => { e.preventDefault();
      a.dataset.go === "home" ? showHome() : showProject(a.dataset.go); });

  // A folder inside a project is the same card as on the projects screen —
  // opening one is the same move, so it should look like the same thing.
  $("projectChildren").innerHTML = "";
  if (data.children.length) {
    const shelf = document.createElement("div");
    shelf.className = "grid";
    for (const c of data.children) {
      const full = projectModel.byId.get(Number(c.id)) || c;
      shelf.appendChild(hierarchyCard({ ...full, description: c.description }));
    }
    $("projectChildren").appendChild(shelf);
  }

  const workspace = ProjectWorkspaceState.derive(data, projectModel, levelOf);
  const { bucket, locked, level, holdsParts, libraryFolder, folders, pieces,
          drafts, recorded, stray, both } = workspace;

  // What a level holds decides what the screen offers. A venture never gets a
  // stitch button, because a venture has nothing to stitch.
  $("contentsHeading").textContent = workspace.contentsHeading;
  $("contentsSummary").textContent = workspace.contentsSummary;

  // Blocks appear only when they have something in them. Both headings are
  // dropped when only one block is showing — the card title already says it.
  $("foldersBlock").style.display = workspace.showFoldersBlock ? "" : "none";
  // Only a folder (and Unsorted) can hold recordings. But if something is
  // already sitting at the wrong level — from before the levels existed, or
  // from a move — it is still shown, with a way out. Hiding it would lose it.
  $("sequenceBlock").style.display = workspace.showSequenceBlock ? "" : "none";
  $("strayNotice").style.display = stray ? "" : "none";
  if (stray) {
    $("strayNotice").innerHTML =
      `<span><b>${data.parts.length} recording` +
      `${data.parts.length === 1 ? "" : "s"} in the wrong place.</b> ` +
      `Recordings live in Productions, and this is a ${level.one}. ` +
      `They still play and nothing is lost — move them into a Production ` +
      `when you're ready.</span><span class="spacer"></span>`;
    const fix = document.createElement("button");
    fix.className = "ghost fit";
    fix.textContent = `Move ${data.parts.length === 1 ? "it" : "them all"} to a Production`;
    fix.onclick = async () => {
      const target = await pickProject({
        title: "Where should these live?",
        body: "Only Productions hold recordings, so the rest are greyed out.",
        blocked: new Map(projectModel.list.filter(x => x.container_type !== "production")
          .map(x => [x.id, `A ${levelOf(x).one} holds ` +
                           `${levelOf(x).holdsMany}, not recordings`])),
        ok: "Move them here",
      });
      if (!target) return;
      const res = await partService.moveMany(data.parts.map(x => x.id), Number(target));
      if (res.error) return setStatus("projectStatus", res.error, "err");
      await loadProjectTree();
      showProject(data.id);
      setStatus("projectStatus", `Moved ${res.moved} into ` +
        `"${(projectModel.byId.get(Number(target)) || {}).name}".`, "ok");
    };
    $("strayNotice").appendChild(fix);
  }
  $("foldersHeading").style.display = both ? "" : "none";
  $("sequenceHeading").style.display = both ? "" : "none";
  $("partsList").style.display = workspace.showPartsList ? "" : "none";
  $("assetLibraryBlock").hidden = !workspace.showAssetLibrary;
  if (workspace.showAssetLibrary) {
    const guidance = {
      Music: "Music beds uploaded here can run underneath any Production in this Venture.",
      Intros: "Reusable openings uploaded here can be linked into any production.",
      Outros: "Reusable endings uploaded here can be linked into any production.",
      Stingers: "Short transitions uploaded here can be linked wherever they are needed.",
    };
    $("assetLibraryTitle").textContent = `Add to ${data.name}`;
    $("assetLibraryHint").textContent = guidance[data.name] ||
      "Files here can be reused by every production in this venture.";
    $("sequenceHeading").style.display = pieces ? "" : "none";
    $("sequenceHeading").childNodes[0].textContent = "Library files ";
  } else {
    $("sequenceHeading").childNodes[0].textContent = "Recording sequence ";
  }
  $("partSilence").style.display = workspace.showPartSilence ? "" : "none";
  // Assets come from the venture, so this only exists inside a story folder —
  // and never inside the library itself, where it would nest a link in the
  // very thing it points at.
  $("partAsset").style.display = workspace.showPartAsset ? "" : "none";
  $("silenceSeconds").style.display = workspace.showPartSilence ? "" : "none";
  $("recordDrafts").style.display = workspace.showRecordDrafts ? "" : "none";
  $("recordDrafts").textContent =
    `Record ${drafts} draft${drafts === 1 ? "" : "s"}`;
  // Stitching or playing needs something that actually has audio.
  $("projectStitch").style.display = workspace.showStitch ? "" : "none";
  $("projectStitch").textContent = workspace.exports
    ? "Export new version" : "Export production";
  // The persistent production toolbar (and mobile shell) owns sequence
  // playback. Keep this legacy trigger hidden as the shared event target.
  $("playAll").style.display = "none";
  $("projectPanelToggle").style.display = workspace.showProduction ? "" : "none";
  // Adding audio only makes sense where audio can live.
  $("partAdd").style.display = workspace.showPartAdd ? "" : "none";
  $("partAdd").textContent = pieces ? "+ Speech" : "+ First speech";
  // The button always names what it makes, so you never wonder what you'll get.
  $("projectNew").style.display = workspace.showProjectNew ? "" : "none";
  $("projectNew").textContent = `+ New ${level.holds}`;
  $("projectNew").title = `Create a ${level.holds} inside "${data.name}"`;
  $("partAdd").className = holdsParts ? "ghost next" : "ghost fit";
  $("projectNew").className = holdsParts ? "ghost fit" : "ghost next";
  // The workspace has distinct jobs. Hide an entire zone when that job does
  // not exist at the current hierarchy level, rather than leaving orphaned
  // labels or disabled-looking controls behind.
  $("projectCreateGroup").hidden = !workspace.showCreateGroup;
  $("projectPaceGroup").hidden = !workspace.showPaceGroup;
  $("projectTransportGroup").hidden = !workspace.showPlayAll;
  $("shellPlayAll").hidden = !workspace.showPlayAll;
  $("projectActions").hidden =
    $("projectCreateGroup").hidden && $("projectPaceGroup").hidden &&
    $("projectTransportGroup").hidden;
  $("projectFinishGroup").hidden = !workspace.showFinishGroup;
  $("projectExportsSection").hidden = !workspace.showExports;
  $("projectProduction").hidden = !workspace.showProduction;
  if (!workspace.showProduction) closeProjectPanel();
  $("statLengthWrap").style.display = workspace.showLength ? "" : "none";
  $("projectSettings").style.display = workspace.showSettings ? "" : "none";
  $("projectSettings").textContent = "Settings";
  $("lockedNote").style.display = locked && !bucket ? "" : "none";
  $("projectName").readOnly = bucket || locked;
  $("projectName").title = locked
    ? `"${data.name}" is part of the app — it can't be renamed, moved or deleted`
    : "Click to rename";
  $("projectDesc").readOnly = bucket;
  $("projectDesc").placeholder = bucket
    ? "Everything that hasn't been filed into a project lands here."
    : brand ? "Describe this venture and what it creates"
    : (libraryFolder || data.container_type === "library")
      ? "Reusable audio grouped by its production role"
    : "Add a description — what this project is for";
  $("projectIcon").style.display = bucket ? "none" : "";

  stopPlayAll();
  // A selection belongs to the list it was made in.
  if (previousId !== data.id) picked.clear();
  if (composer.target && composer.target.id !== data.id) composer.home();
  if (composer.target) { composer.target = data; composer.describe(); }
  renderParts(data.parts);
  // Music and the shape strip only mean anything where recordings live.
  $("musicBlock").style.display = holdsParts && !bucket && !libraryFolder ? "" : "none";
  if (holdsParts && !bucket && !libraryFolder) {
    await projectMusic.load(data.id, request);
    if (request !== projectRequest) return;
    setSequenceButton(false);
    drawStrip(data.parts);
  } else {
    $("folderStrip").style.display = "none";
  }
  drawSelectBar();
  const me = projectModel.byId.get(Number(data.id));
  const libraryResource = ["library", "asset_collection"].includes(data.container_type);
  const inside = libraryResource
    ? (me ? me.all_files : data.parts.length)
    : (me ? me.all_parts : data.parts.length);
  $("statCostWrap").style.display = libraryResource ? "none" : "";
  $("statCost").textContent = `$${(me ? me.all_cost : data.total_cost).toFixed(4)}`;
  // Reveal this project in the sidebar rather than leaving it collapsed
  // somewhere the user can't see.
  for (const step of data.trail) expanded.add(step.id);
  if (data.children.length) expanded.add(data.id);
  rememberBranches();
  // A folder of folders should show what it contains overall, not a bare zero.
  if (libraryResource) {
    $("statParts").textContent = inside;
    $("statPartsLabel").textContent = inside === 1 ? "file" : "files";
  } else if (!pieces && (folders || inside)) {
    $("statParts").textContent = inside;
    $("statPartsLabel").textContent = inside === 1 ? "part inside"
                                                   : "parts inside";
  } else {
    $("statPartsLabel").textContent = pieces === 1 ? "part" : "parts";
  }
  loadProjectTree();
}

async function uploadLibraryAssets(files) {
  const destination = openProject;
  if (!destination || destination.level !== "folder" ||
      !projectModel.contextFor(destination).isLibrary) {
    return setStatus("assetUploadStatus", "Open a venture library folder first.", "err");
  }
  const audioFiles = [...files];
  if (!audioFiles.length) return;
  let uploaded = 0;
  for (const [index, file] of audioFiles.entries()) {
    setStatus("assetUploadStatus",
      `Uploading ${index + 1} of ${audioFiles.length}: ${file.name}…`, "busy");
    const result = await assetService.upload(destination.id, file);
    if (result.error) {
      return setStatus("assetUploadStatus", `${file.name}: ${result.error}`, "err");
    }
    uploaded += 1;
  }
  await loadProjectTree();
  await showProject(destination.id);
  setStatus("assetUploadStatus",
    `${uploaded} file${uploaded === 1 ? "" : "s"} added to ${destination.name}. ` +
    "No model was called and nothing was charged.", "ok");
}

$("assetUploadInput").onchange = event => {
  uploadLibraryAssets(event.target.files);
  event.target.value = "";
};

StudioFileDrop.bind({
  target: $("assetUploadZone"), input: $("assetUploadInput"),
  onFiles: files => uploadLibraryAssets(files),
});

/* Keep the visible voice control in step with the hidden select that the rest
   of the app reads. One source of truth, one thing on screen. */
function drawVoicePick() {
  const voice = $("voice").value;
  $("voicePickFace").innerHTML = voiceAvatar(voice, 30);
  $("voicePickName").textContent = voiceLabel(voice) || "Pick a voice";
  const detail = voiceDetail(voice);
  $("voicePickDetail").textContent = detail;
  $("voicePickDetail").style.display = detail ? "" : "none";
  $("voicePick").title = `${voiceLabel(voice)} — click to browse all voices`;
  updateComposerRoute();
}

/* ── who is speaking ─────────────────────────────────────────────────────
   Alibaba ships no pictures for its 597 voices, so a voice gets a stable mark
   of its own: a colour derived from its id, which means the same voice is the
   same colour everywhere, forever. You can put a real picture over it. */
function voiceHue(voice) {
  let hash = 0;
  // Hashed from the key, so Plus and Flash of one voice are the same colour.
  for (const ch of voiceKey(voice)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function voiceInitials(voice) {
  // The library name first — two Chinese characters make a better mark than
  // the letters of a model identifier ever could.
  const known = (library || []).find(v => v.id === voice);
  if (known && known.name) return known.name.slice(0, 2);
  const label = voiceLabel(voice).replace(/·.*$/, "").trim();
  const words = label.split(/[\s_-]+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase() || "??";
}

function voiceAvatar(voice, size = 30) {
  const clone = clonedVoices.find(v => clonedVoiceId(v) === voice);
  const image = clone?.image || (config.voice_images || {})[voiceKey(voice)];
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`;
  if (image) {
    return `<span class="voice-face" style="${style}">` +
           `<img src="${escapeHtml(image)}" alt=""></span>`;
  }
  const hue = voiceHue(voice);
  return `<span class="voice-face" style="${style};--hue:${hue}">` +
         `${escapeHtml(voiceInitials(voice))}</span>`;
}

/* The one-line description under a voice's name, from the library. */
function voiceDetail(voice) {
  // A cloned voice already says "your voice" in its name — repeating it as a
  // description reads as a stutter.
  const clone = clonedVoices.find(v => clonedVoiceId(v) === voice);
  if (clone) return clone.trait || clone.notes || clone.scene || "";
  if (isCloned(voice)) return "";
  const found = (library || []).find(v => v.id === voice);
  if (found) return [found.gender, found.age, found.trait].filter(Boolean).join(", ");
  // The library only loads when you open the browser, so fall back to the
  // short descriptions the app already ships with.
  for (const tier of Object.keys(config.voices || {})) {
    if (config.voices[tier][voice]) return config.voices[tier][voice];
  }
  return "";
}

/* A cloned voice's real id is the model name, your prefix and a uuid — far too
   long for a row. Show the part you named it. */
/* The voice itself, without the quality it happens to speak at. Alibaba gives
   the same voice two ids; a picture or a favourite belongs to the voice. */
function voiceKey(id) {
  return String(id || "").replace(/^qwen[\w.-]*?-tts-(?:plus|flash)-/i, "").trim();
}

/* Every voice, once, with the qualities it can speak at. Built from the two
   catalogue entries Alibaba publishes per voice. */
let catalogue = [];
function buildCatalogue() {
  const byKey = new Map();
  for (const v of library) {
    const key = voiceKey(v.id);
    const found = byKey.get(key) || {
      key, name: v.name, gender: v.gender, age: v.age, trait: v.trait,
      scene: v.scene, origin: v.language, sample: v.sample, tiers: {},
    };
    found.tiers[v.tier] = v.id;
    if (!found.sample) found.sample = v.sample;
    byKey.set(key, found);
  }
  catalogue = [...byKey.values()];
}

/* Origin is where a voice comes from, not what it can speak. Language coverage
   belongs to the selected engine and clone contract; only origin is a fact. */
function readsEnglish(v) {
  return v.origin === "English";
}

function isCloned(voice) {
  return clonedVoices.some(v => clonedVoiceId(v) === voice) ||
    /^qwen[\w.-]*?-tts-(?:plus|flash)-[a-z0-9]+-[0-9a-f]{16,}$/i.test(voice || "");
}

function voiceLabel(voice) {
  // A name you gave it wins over anything derived from the id.
  const custom = clonedVoices.find(v => clonedVoiceId(v) === voice);
  if (custom?.name) return custom.name;
  const named = (voiceMeta || {})[voiceKey(voice)];
  if (named && named.name) return named.name;
  const clone = /^qwen[\w.-]*?-tts-(?:plus|flash)-([a-z0-9]+)-[0-9a-f]{16,}$/i.exec(voice || "");
  if (clone) return `${clone[1]} · your voice`;
  const known = (library || []).find(v => v.id === voice);
  if (known && known.name) return known.name;
  // A library voice is stored with the model in front of it; nobody needs to
  // read "qwen-audio-3.0-tts-plus-" nine times on one screen.
  return (voice || "").replace(/^qwen[\w.-]*?-tts-(?:plus|flash)-/i, "");
}

/* ── changing one thing without redrawing everything ─────────────────────
   Every action used to call showProject(), which refetched the folder and
   rebuilt every row. On eight parts that is invisible; on a hundred it throws
   away your scroll position, your selection and any open takes panel, and
   flickers while it does it. These touch only what changed. */

/* One part changed: fetch the folder once, swap that row, fix the totals. */
async function refreshPart(partId) {
  if (!openProject) return;
  const fresh = await projectService.get(openProject.id);
  if (fresh.error) return showProject(openProject.id);
  openProject = fresh;
  const row = $("partsList").querySelector(`.part[data-part-id="${partId}"]`);
  const part = fresh.parts.find(p => p.id === partId);
  if (!row || !part) return renderParts(fresh.parts);   // it left, or arrived
  const rebuilt = renderParts(fresh.parts, { only: partId });
  if (!rebuilt) renderParts(fresh.parts);
  refreshTotals(fresh.parts);
}

/* A part is gone: take the row out rather than rebuilding the list. */
async function dropPartRow(partId) {
  if (!openProject) return;
  const row = $("partsList").querySelector(`.part[data-part-id="${partId}"]`);
  const seam = row && row.previousElementSibling;
  const panel = row && row.nextElementSibling;
  if (panel && panel.classList.contains("takes-panel")) panel.remove();
  if (seam && seam.classList.contains("seam")) seam.remove();
  if (row) row.remove();
  openProject.parts = (openProject.parts || []).filter(p => p.id !== partId);
  renumberParts();
  refreshTotals(openProject.parts);
  loadProjectTree();
}

/* The numbers down the left are positions in a list, so they move up. */
function renumberParts() {
  let n = 0;
  for (const row of $("partsList").querySelectorAll(".part")) {
    if (row.classList.contains("stitched")) continue;
    const badge = row.querySelector(".part-num");
    if (badge) badge.textContent = ++n;
  }
}

function refreshTotals(parts) {
  const sequence = (parts || []).filter(p => p.kind !== "stitch");
  const seconds = sequence.reduce((n, p) => n + partSeconds(p), 0);
  const drafts = sequence.filter(p => p.kind === "draft").length;
  $("partsTotals").textContent =
    `${clock(seconds)} · ${sequence.length} parts` +
    (drafts ? ` · ${drafts} not recorded yet` : "");
  $("statParts").textContent = sequence.length;
  $("statLength").textContent = clock(seconds);
  drawStrip(parts || []);
}

function partSeconds(part) {
  // A draft has no audio, so it contributes nothing to the running time. It is
  // counted as a part, just not as a duration.
  if (part.kind === "draft") return 0;
  if (part.kind === "silence") return parseFloat(part.title || 0);
  // Measured at generation time. Byte estimates were out by the bitrate ratio.
  if (part.duration_ms) return part.duration_ms / 1000;
  return secondsFrom(part.size_bytes || 0);
}

const partRows = ProjectPartRow.create({
  voiceAvatar, voiceLabel, voiceDetail, icon, clock, escapeHtml, partSeconds,
});
const exportCards = ProjectExportCard.create({ icon, clock, escapeHtml });

function renderProjectExports(stitches) {
  const section = $("projectExportsSection");
  const box = $("projectExports");
  box.innerHTML = "";
  section.hidden = !stitches.length;
  if (!stitches.length) return;
  $("projectExportCount").textContent = stitches.length === 1
    ? "1 snapshot" : `${stitches.length} snapshots`;
  const sequenceDuration = (openProject?.parts || [])
    .filter(part => part.kind !== "stitch")
    .reduce((sum, part) => sum + partSeconds(part), 0);
  [...stitches].reverse().forEach((item, index) => {
    const outdated = index === 0 && Math.abs(
      Number(item.duration_ms || 0) / 1000 - sequenceDuration) > 1;
    box.appendChild(exportCards.render(item, {
      latest: index === 0,
      outdated,
      sequenceDuration,
      downloadUrl: `/audio/${item.filename}`,
      onPlay: (part, button) => player.toggle(`/audio/${part.filename}`,
        playing => {
          button.innerHTML = icon(playing ? "pause" : "play");
          button.title = playing ? "Pause this export" : "Play this export";
          button.setAttribute("aria-label", button.title);
        }, {
          name: part.filename, title: part.title || "Finished audio",
          meta: `${clock((part.duration_ms || 0) / 1000)} · Project export`,
        }),
    }));
  });
}

function renderParts(parts, { only = null } = {}) {
  const box = $("partsList");
  // Rebuilding one row keeps the scroll, the selection and any open panel.
  let replaced = false;
  if (!only) box.innerHTML = "";
  const sequence = parts.filter(p => p.kind !== "stitch");
  const stitches = parts.filter(p => p.kind === "stitch");
  const library = openProject?.container_type === "asset_collection";
  renderProjectExports(stitches);

  if (!sequence.length) {
    // A folder of folders is complete as it is; only say something is missing
    // when there's genuinely nothing here at all.
    box.innerHTML = library
      ? `<div class="empty compact"><b>No files in this collection yet</b>` +
        `<span>Drop audio into the upload area above.</span></div>`
      : openProject?.children?.length ? "" :
        `<div class="empty"><b>Nothing here yet</b>${levelOf(openProject).blank}</div>`;
    $("partsTotals").textContent = "";
    $("statParts").textContent = 0;
    $("statLength").textContent = "0:00";
    return;
  }

  const total = sequence.reduce((n, p) => n + partSeconds(p), 0) || 1;
  let number = 0;

  const draw = (part, label, extraClass) => {
    const silent = part.kind === "silence";
    const draft = part.kind === "draft";
    const asset = part.kind === "asset";
    const seconds = partSeconds(part);
    const index = sequence.indexOf(part);
    const primaryActions = [];
    if (draft) {
      primaryActions.push(
        { icon: "mic", title: "Record this part now", run: () => recordPart(part) },
        { icon: "pencil", title: "Edit the words and settings", run: () => editDraft(part) },
      );
    } else if (library) {
      primaryActions.push({
        icon: "play", title: "Play this library file",
        run: button => togglePart(part, button, seconds),
      });
    } else if (asset) {
      if (!part.missing) primaryActions.push({
        icon: "play", title: "Play this asset",
        run: button => togglePart(part, button, seconds),
      });
      primaryActions.push({
        icon: "stack", title: "Open it in the venture's library",
        disabled: !part.asset_of,
        run: async () => {
          const where = await partService.full(part.asset_of);
          if (where.error) return setStatus("projectStatus", "That asset is gone.", "err");
          await showProject(where.project_id);
        },
      });
    } else if (!silent) {
      primaryActions.push(
        { icon: "play", title: "Play", run: button => togglePart(part, button, seconds) },
        { icon: "redo", title: part.takes
            ? `Make another take (${part.takes} kept)` : "Make another take",
          run: () => regeneratePart(part) },
      );
    }

    const menuActions = [];
    if (extraClass !== "stitched" && !library) {
      primaryActions.push({
        icon: "copy", title: silent ? "Duplicate this gap" : "Duplicate — free, no new audio",
        run: async () => {
        const res = await partService.duplicate(part.id);
        if (res.error) return setStatus("projectStatus", res.error, "err");
        setStatus("projectStatus", "Copied — the duplicate is right below.", "ok");
        showProject(openProject.id);
      }});
      primaryActions.push(
        { icon: "up", title: "Move up", disabled: index <= 0,
          run: () => moveP(sequence, index, -1) },
        { icon: "down", title: "Move down", disabled: index === sequence.length - 1,
          run: () => moveP(sequence, index, 1) },
      );
      if (!silent) menuActions.push({
        icon: "stack", title: "Move to another project…", run: async () => {
        const target = await pickProject({
          title: "Move this recording",
          body: "It leaves this folder and is added to the end of the one you " +
                "choose. Its takes go with it.",
          current: openProject.id,
          blocked: notFolders(new Map([[openProject.id, "It's already here"]])),
          ok: "Move it here",
        });
        if (!target) return;
        await partService.move(part.id, Number(target));
        await loadProjectTree();
        showProject(openProject.id);
        setStatus("projectStatus",
          `Moved into "${(projectModel.byId.get(Number(target)) || {}).name}".`, "ok");
      }});
    }
    menuActions.push({
      icon: "close", title: library ? "Delete this library file"
        : silent ? "Remove this gap" : "Delete this part", danger: true,
      run: async () => {
      if (!await ui.confirm(library ? "Delete this library file?"
            : silent ? "Remove this gap?" : "Delete this part?",
            library ? "The uploaded file is removed from this Venture library. " +
                      "Productions that linked it will show that the Asset is missing."
            : silent ? "The parts after it move up."
                   : `The audio file goes from disk` +
                     (part.takes ? `, along with its ${part.takes} older take` +
                                   `${part.takes === 1 ? "" : "s"}` : "") +
                     `. Any subtitles and translations go too. ` +
                     `The parts after it move up.`,
            silent ? "Remove" : "Delete")) return;
      await partService.remove(part.id, { deleteFile: true });
      dropPartRow(part.id);
    }});

    const row = partRows.render(part, {
      label, extraClass, library, selectable: !library, selected: picked.has(part.id),
      takesOpen: openTakes.has(part.id),
      primaryActions, menuActions,
      onDurationChange: silent ? async (_, value) => {
        const previous = Number(part.title || 0);
        const result = await projectService.editSilence(part.id, value);
        if (result?.error) {
          setStatus("projectStatus", result.error, "err");
          return;
        }
        part.title = String(result.seconds ?? value);
        part.text = `${part.title} seconds of silence`;
        await refreshPart(part.id);
        setStatus("projectStatus",
          `Silence changed from ${previous}s to ${part.title}s.`, "ok");
      } : null,
      onOpen: () => draft ? editDraft(part) : openAudio(part.id),
      onTakes: () => showTakes(part),
      onSubtitles: () => partSubtitles(part),
      onTranslate: () => partTranslate(part),
      onSelect: ({ event, checked }) => {
      // Shift extends from the last one you touched, the way every file list
      // works — otherwise selecting twenty parts is twenty clicks.
      if (event.shiftKey && lastPicked !== null) {
        const ids = sequence.map(x => x.id);
        const from = ids.indexOf(lastPicked), to = ids.indexOf(part.id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          const on = checked;
          for (const id of ids.slice(lo, hi + 1)) on ? picked.add(id) : picked.delete(id);
          lastPicked = part.id;
          renderParts(openProject.parts);
          drawSelectBar();
          return;
        }
      }
      checked ? picked.add(part.id) : picked.delete(part.id);
      lastPicked = part.id;
      row.classList.toggle("picked", checked);
      drawSelectBar();
      },
      draggable: extraClass !== "stitched" && !openProject?.bucket && !library,
      canDragOver: () => dragging !== null && dragging !== part.id,
      onDragStart: () => { dragging = part.id; },
      onDragEnd: () => {
        dragging = null;
        box.querySelectorAll(".part").forEach(r =>
          r.classList.remove("drop-above", "drop-below"));
      },
      onDrop: ({ after }) => {
        dropPart(sequence, dragging, part.id, after);
      },
    });
    if (only) {
      const existing = box.querySelector(`.part[data-part-id="${only}"]`);
      if (part.id === only && existing) { existing.replaceWith(row); replaced = true; }
    } else {
      box.appendChild(row);
    }
    if (openTakes.has(part.id)) drawTakes(part);
  };

  // A bucket has no order, so it gets no numbers, no seams and no reordering.
  if (openProject?.bucket) {
    for (const part of parts) draw(part, "•", "");
    if (only) return replaced;
    $("partsTotals").textContent = `${parts.length} recordings`;
    $("statParts").textContent = parts.length;
    $("statLength").textContent = clock(total);
    return;
  }

  if (library) {
    for (const part of sequence) draw(part, "•", "library-asset");
    if (only) return replaced;
    $("partsTotals").textContent = `${sequence.length} file${sequence.length === 1 ? "" : "s"}`;
    $("statParts").textContent = sequence.length;
    $("statLength").textContent = clock(total);
    return;
  }

  sequence.forEach((part, index) => {
    if (!only) box.appendChild(seam(index));
    draw(part, ++number, part.kind === "silence" ? "silence"
                       : part.kind === "draft" ? "draft"
                       : part.kind === "asset" ? "asset" : "");
  });
  if (!only) box.appendChild(seam(sequence.length));
  if (only) return replaced;

  const drafts = sequence.filter(x => x.kind === "draft").length;
  $("partsTotals").textContent =
    `${clock(total)} · ${sequence.length} parts` +
    (drafts ? ` · ${drafts} not recorded yet` : "");
  $("statParts").textContent = sequence.length;
  $("statLength").textContent = clock(total);
}

/* One part, through the app's single player — so starting it stops a voice
   sample, and auditioning a voice stops it. */
function togglePart(part, button, seconds) {
  player.toggle(`/audio/${part.filename}`, playing => {
    button.innerHTML = icon(playing ? "pause" : "play");
    button.title = playing ? "Pause" : "Play";
  }, { name: part.filename, title: part.text || part.title || part.filename,
       meta: `${voiceLabel(part.voice)} · Project part`, voice: part.voice });
}

const TRANSLATE_INTO = ["English", "French", "Spanish", "Portuguese", "German",
  "Italian", "Dutch", "Polish", "Turkish", "Russian", "Arabic", "Hindi",
  "Chinese", "Japanese", "Korean", "Indonesian", "Malay", "Thai", "Vietnamese",
  "Tagalog"];

/* Captions are one workspace per recorded part. Recognition and translation
   stay API adapters here; navigation, preview and exact-file download do not. */
const captionManager = StudioCaptionManager.create({
  get: $,
  languages: TRANSLATE_INTO,
  getLanguages: partId => captionService.list(partId),
  getTranscript: transcriptId => captionService.get(transcriptId),
  transcribe: part => captionService.transcribe(part),
  translate: (transcriptId, target) => captionService.translate(transcriptId, target),
  confirm: (...args) => ui.confirm(...args),
  refreshPart,
  downloadText: download,
  clock, escapeHtml,
});

function partSubtitles(part) {
  captionManager.open(part, { focus: "original" });
}

function partTranslate(part) {
  captionManager.open(part, { focus: "translations" });
}

/* Saving a file the browser made, without a round trip to the server. */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Open a draft in the composer to change its words or settings. */
function editDraft(part) {
  composer.open({
    project: openProject, part,
    title: `Part ${(part.position || 0) + 1} — draft`,
  });
}

/* Record one draft straight from the list, with its saved settings. */
async function recordPart(part) {
  setStatus("projectStatus", `Recording part ${(part.position || 0) + 1}…`, "busy");
  watchProgress("projectStatus");
  const res = await partService.render(part.id);
  stopWatchingProgress();
  if (res === null) return setStatus("projectStatus", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("projectStatus", res.error, "err");
  await refreshPart(part.id);
  setStatus("projectStatus", `Part recorded — $${res.cost}.`, "ok");
}

/* Record every draft in the project, in order. */
async function recordAllDrafts() {
  const drafts = (openProject.parts || []).filter(p => p.kind === "draft");
  if (!drafts.length) return;
  const characters = drafts.reduce((n, d) => n + (d.text || "").length, 0);
  if (!await ui.confirm(
        `Record ${drafts.length} draft${drafts.length === 1 ? "" : "s"}?`,
        `${characters} characters will be sent to the model, in order. Parts ` +
        `that are already recorded are left alone. If one fails, the rest ` +
        `still finish and you'll be told which failed.`,
        `Record ${drafts.length}`)) return;

  setStatus("projectStatus", "Recording drafts…", "busy");
  watchProgress("projectStatus");
  const res = await partService.renderDrafts(openProject.id);
  stopWatchingProgress();
  if (res === null) return setStatus("projectStatus", "Cancelled — nothing charged.", "");
  if (res.error) return setStatus("projectStatus", res.error, "err");
  await showProject(openProject.id);
  const failed = res.failed || [];
  setStatus("projectStatus",
    `Recorded ${res.recorded} part${res.recorded === 1 ? "" : "s"}.` +
    (failed.length ? ` Part${failed.length === 1 ? "" : "s"} ` +
                     `${failed.map(f => f.position).join(", ")} failed — ` +
                     `they're still drafts, so nothing was lost.` : ""),
    failed.length ? "err" : "ok");
}

/* Another take of a part. The previous one is kept, never overwritten. */
function regeneratePart(part) {
  // Everything about the part loads in, so a new take can change the voice, the
  // pace, the direction — not just the words.
  composer.open({
    project: openProject, part,
    title: `Part ${(part.position ?? 0) + 1} — another take`,
  });
}

/* Browse the takes of a part and choose which one is in use. */
/* Which parts have their takes open. Kept across re-renders so promoting or
   deleting a take doesn't collapse the list you're working in. */
const openTakes = new Set();

async function showTakes(part) {
  openTakes.has(part.id) ? openTakes.delete(part.id) : openTakes.add(part.id);
  await drawTakes(part);
}

/* The takes of one part, listed under it. The one in use is shown too, marked
   as such — hiding it made it impossible to tell what you were comparing to. */
async function drawTakes(part) {
  const row = $("partsList").querySelector(`.part[data-part-id="${part.id}"]`);
  if (!row) return;
  let panel = row.nextElementSibling;
  if (panel && !panel.classList.contains("takes-panel")) panel = null;

  if (!openTakes.has(part.id)) {
    if (panel) panel.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "takes-panel";
    row.insertAdjacentElement("afterend", panel);
  }
  panel.innerHTML = '<div class="hint" style="padding:6px 8px">Loading takes…</div>';

  const data = await partService.takes(part.id);
  const older = data.takes || [];
  panel.innerHTML = "";

  const line = (take, current) => takeCards.render(take, {
    current,
    variant: "compact",
    onUse: current ? null : async () => {
        await partService.promote(take.id);
        await showProject(openProject.id);
        setStatus("projectStatus",
          "Swapped — the one it replaced is kept as a take.", "ok");
      },
    onDelete: current ? null : async () => {
        if (!await ui.confirm("Delete this take?",
              "Only this take goes — the part and its other takes stay. " +
              "This one can't be brought back.", "Delete take")) return;
        await partService.remove(take.id, { deleteFile: true });
        drawTakes(part);
        showProject(openProject.id);
      },
  });

  panel.appendChild(line({
    when: "", voice: part.voice, rate: part.rate, seed: part.seed,
    cost: part.cost, filename: part.filename, text: part.text, id: part.id }, true));
  older.forEach(take => panel.appendChild(line(take, false)));
  if (!older.length) {
    const note = document.createElement("div");
    note.className = "hint";
    note.style.padding = "6px 8px";
    note.textContent = "Only one take so far. Use ⟲ on the part to make another.";
    panel.appendChild(note);
  }
}

/* The gap between two parts, offering to put something there. */
function seam(at) {
  const strip = document.createElement("div");
  strip.className = "seam";
  strip.innerHTML =
    `<div class="seam-actions">` +
    `<button class="seam-btn">+ Audio here</button>` +
    `<button class="seam-btn quiet">+ Silence here</button>` +
    `<button class="seam-btn quiet">+ Library audio here</button>` +
    `</div>`;
  const [audio, quiet, asset] = strip.querySelectorAll("button");
  asset.onclick = () => openAssets(at);
  audio.onclick = () => composer.open({ project: openProject, at,
                                        title: `New part ${at + 1}` });
  quiet.onclick = async () => {
    const res = await projectService.addSilence(
      openProject.id, parseFloat($("silenceSeconds").value) || 4, at);
    if (res.error) return setStatus("projectStatus", res.error, "err");
    showProject(openProject.id);
  };
  return strip;
}

/* ── file names and tags ─────────────────────────────────────────────────
   One form, used twice: app-wide in Settings, and inside a venture where every
   field falls back to the global one when left empty. */
const NAMING_FIELDS = ["Prefix", "Digits", "IncludeProject", "Artist", "Album",
                       "Title", "Genre", "Year", "Copyright", "Comment", "Cover"];
const NAMING_KEY = { Prefix: "prefix", Digits: "digits",
                     IncludeProject: "include_project", Artist: "artist",
                     Album: "album", Title: "title", Genre: "genre",
                     Year: "year", Copyright: "copyright", Comment: "comment",
                     Cover: "cover" };

function readNaming(prefix, { blankMeansInherit = false } = {}) {
  const out = {};
  for (const field of NAMING_FIELDS) {
    const el = $(prefix + field);
    let value = el.value;
    if (field === "IncludeProject" || field === "Cover") value = value === "yes";
    if (field === "Digits") value = parseInt(value, 10);
    // In a venture, an untouched field means "use the app setting", so it is
    // left out entirely rather than saved as an empty string.
    if (blankMeansInherit && el.tagName === "INPUT" && el.value.trim() === "") continue;
    out[NAMING_KEY[field]] = value;
  }
  return out;
}

function writeNaming(prefix, values, inherited) {
  for (const field of NAMING_FIELDS) {
    const el = $(prefix + field);
    const key = NAMING_KEY[field];
    const own = values ? values[key] : undefined;
    if (field === "IncludeProject" || field === "Cover") {
      el.value = (own === undefined ? inherited[key] : own) ? "yes" : "no";
    } else if (field === "Digits") {
      el.value = String(own === undefined ? inherited[key] : own);
    } else {
      el.value = own === undefined || own === null ? "" : own;
      // The placeholder shows what will be used if you leave it blank.
      if (inherited) el.placeholder = String(inherited[key] || "none");
    }
  }
  namingPreview(prefix);
}

/* Show the resulting filename as you type, so nothing has to be imagined. */
function namingPreview(prefix) {
  const sep = "-";
  const settings = readNaming(prefix);
  const global = config.naming || {};
  const value = k => {
    const v = settings[k];
    return v === "" || v === undefined || (typeof v === "number" && isNaN(v))
      ? global[k] : v;
  };
  const digits = Math.max(1, value("digits") || 2);
  const pieces = [value("prefix") || "vrn-studio"];
  if (value("include_project")) pieces.push("Sleeping guides");
  pieces.push("Christian prayer — falling asleep");
  pieces.push(`part${sep}${String(3).padStart(digits, "0")}`);
  const name = pieces.join(sep)
    .replace(/[\s_—–~•·,;]+/g, sep).replace(/[.']/g, "")
    .replace(new RegExp(sep + "{2,}", "g"), sep);
  $(prefix + "Preview").textContent = `${name}.mp3`;
}

for (const prefix of ["nm", "vn"]) {
  for (const field of NAMING_FIELDS) {
    const el = document.getElementById(prefix + field);
    if (el) el.addEventListener("input", () => namingPreview(prefix));
    if (el) el.addEventListener("change", () => namingPreview(prefix));
  }
}

$("namingSave").onclick = async () => {
  const res = await api("/api/prefs", { naming: readNaming("nm") });
  if (res.error) return setStatus("namingStatus", res.error, "err");
  config.naming = readNaming("nm");
  setStatus("namingStatus",
    "Saved. It applies to the next download — nothing on disk changed.", "ok");
};

$("namingReset").onclick = async () => {
  if (!await ui.confirm("Back to the defaults?",
        "Your own prefix and tag templates are cleared. Files on disk are " +
        "untouched, as always.", "Reset")) return;
  await api("/api/prefs", { naming: null });
  const fresh = await api("/api/config");
  config.naming = fresh.naming;
  writeNaming("nm", fresh.naming, fresh.naming);
  setStatus("namingStatus", "Back to the defaults.", "ok");
};

/* ── the voices section ──────────────────────────────────────────────────
   Rebuilt around one idea: a catalogue of 597 tells you what exists, but what
   you need is the four you actually use. So the screen leads with yours, your
   favourites and what you reached for last — and the catalogue is a click away.
   Every number here comes from what you really made, not from a marketing blurb. */
let voiceUsage = {};
let voiceMeta = {};          // picture, favourite, note — from the database
const comparing = [];        // voices being judged against each other
let voiceMode = "mine";
let voicePicked = null;
let exploreShown = 120;   // grows as you ask for more, so nothing is cut off
const voiceFilters = { tier: "", gender: "", origin: "", scene: "" };

const favourites = () => new Set(config.voice_favourites || []);
const isFavourite = id => favourites().has(voiceKey(id));

async function loadVoiceUsage() {
  const [usage, meta] = await Promise.all([
    api("/api/voices/usage"), api("/api/voices/meta"),
  ]);
  voiceUsage = usage.usage || {};
  voiceMeta = meta.voices || {};
}

/* ── comparing voices ────────────────────────────────────────────────────
   Choosing a voice is a comparison, never a single judgement. Pick two or
   three, give them one line, and hear them back to back without leaving. */
function addToCompare(v) {
  if (comparing.some(x => x.key === v.key)) return drawCompare();
  if (comparing.length >= 3) comparing.shift();
  comparing.push(v);
  drawCompare();
}

function drawCompare() {
  // Built on demand, so its absence is the normal case, not a fault.
  let tray = maybe("compareTray");
  if (!comparing.length) { if (tray) tray.remove(); return; }
  if (!tray) {
    tray = document.createElement("div");
    tray.className = "compare-tray";
    tray.id = "compareTray";
    $("voiceDetail").appendChild(tray);
  }
  tray.innerHTML =
    `<div class="picked">` +
    comparing.map((v, i) =>
      `<span class="one">${voiceAvatar(v.id, 22)}${escapeHtml(v.name)}` +
      `<button class="icon-btn" data-drop="${i}" title="Remove">${icon("close")}</button>` +
      `</span>`).join("") + `</div>` +
    `<textarea id="compareLine" rows="2" placeholder="One line for all of them…"></textarea>` +
    `<div class="row" style="margin-top:8px">` +
      `<button class="primary fit" id="compareGo">Hear all ${comparing.length}</button>` +
      `<button class="ghost fit" id="compareClear">Clear</button>` +
      `<span class="hint" style="margin:0;align-self:center">` +
        `One after the other, same line. About ` +
        `$${(0.0002 * comparing.length).toFixed(4)} on Flash.</span>` +
    `</div><div class="status" id="compareStatus"></div>`;

  tray.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => {
    comparing.splice(Number(b.dataset.drop), 1); drawCompare();
  });
  $("compareClear").onclick = () => { comparing.length = 0; drawCompare(); };
  $("compareGo").onclick = async () => {
    const line = $("compareLine").value.trim();
    if (!line) return setStatus("compareStatus", "Write one line first.", "err");
    for (const v of comparing) {
      setStatus("compareStatus", `${v.name}…`, "busy");
      const res = await spendGuarded("/api/voice/try",
        { text: line, voice: v.id, model: v.tier }, "Compare voices");
      if (res === null) return setStatus("compareStatus", "Cancelled.", "");
      if (res.error) { setStatus("compareStatus", res.error, "err"); continue; }
      await player.playAndWait({
        url: res.url, name: `${v.name}-comparison`, title: line,
        meta: `${v.name} · voice comparison`, voice: v.id,
      });
    }
    setStatus("compareStatus", "That's all of them.", "ok");
  };
}

/* One uploader for a voice picture, wherever it's triggered from. */
async function uploadVoiceImage(key, file) {
  const res = await mediaService.uploadImage(file);
  if (res.error) return setStatus("vStatus", res.error, "err");
  await api("/api/voice/save", { id: key, image: res.url });
  config.voice_images = { ...(config.voice_images || {}), [key]: res.url };
  voiceMeta[key] = { ...(voiceMeta[key] || {}), image: res.url };
  drawVoicePick();
  if (voicePicked) showVoice(voicePicked);
  if (openProject) renderParts(openProject.parts || []);
}

/* Everything known about one voice, from wherever it happens to live. */
/* Which quality a voice actually speaks with. Guessing from the id was wrong
   for the built-ins — loongeva_v3.6 is Flash, and picking it set Plus, so the
   voice would have been rejected on the next render. */
/* The voice you told the app to open with, as an id for a given quality. */
function defaultVoiceId(tier) {
  const key = config.chosen_default_voice;
  if (!key) return "";
  const known = (catalogue || []).find(v => v.key === key);
  if (known) return known.tiers[tier] || "";
  // A cloned or built-in voice has one id and one tier.
  const cloned = clonedVoices.map(clonedVoiceId)
    .find(id => voiceKey(id) === key);
  if (cloned) return voiceTier(cloned) === tier ? cloned : "";
  return Object.keys(config.voices?.[tier] || {}).find(v => voiceKey(v) === key) || "";
}

/* Open the composer on your default, once everything is loaded. */
function applyDefaultVoice() {
  const key = config.chosen_default_voice;
  if (!key) return;
  for (const tier of ["plus", "flash"]) {
    const id = defaultVoiceId(tier);
    if (!id) continue;
    const clone = clonedVoices.find(v => voiceKey(clonedVoiceId(v)) === voiceKey(id));
    $("engine").value = clone?.engine || "audio";
    $("model").value = voiceTier(id);
    syncEngineUI();
    if (![...$("voice").options].some(o => o.value === id)) {
      $("voice").insertBefore(new Option(voiceLabel(id), id), $("voice").firstChild);
    }
    $("voice").value = id;
    drawVoicePick();
    return;
  }
}

function voiceTier(id) {
  const known = (library || []).find(v => v.id === id)
             || (catalogue || []).find(v => v.key === voiceKey(id));
  if (known) return known.tier || (known.tiers?.flash ? "flash" : "plus");
  for (const tier of Object.keys(config.voices || {})) {
    if (config.voices[tier][id]) return tier;
  }
  return String(id).includes("-flash-") ? "flash" : "plus";
}

/* Is this voice still something we can speak with? A voice you used and then
   deleted the clone of still has recordings, so it has to appear — but saying
   nothing about it would let you pick a voice that no longer exists. */
function voiceKnown(id) {
  // Compare by key: the catalogue stores ids with a tier prefix, usage stores
  // them without, and a voice is the same voice either way.
  const key = voiceKey(id);
  if (config.capabilities?.omni?.system_voices?.[id]) return true;
  if ((catalogue || []).some(v => v.key === key)) return true;
  if (clonedVoices.some(v => voiceKey(clonedVoiceId(v)) === key)) return true;
  return Object.keys(config.voices || {}).some(tier =>
    Object.keys(config.voices[tier]).some(v => voiceKey(v) === key));
}

function voiceRecord(id) {
  const key = voiceKey(id);
  const known = catalogue.find(v => v.key === key);
  const clone = clonedVoices.find(v => clonedVoiceId(v) === id) ||
    clonedVoices.find(v => voiceKey(clonedVoiceId(v)) === key);
  const omniDescription = config.capabilities?.omni?.system_voices?.[id];
  const use = voiceUsage[key] || { uses: 0, folders: 0, spend: 0, last_used: null };
  const gone = !voiceKnown(id);
  const savedName = voiceMeta[key]?.name;
  const technicalHistoricalId = gone && String(id || "").length > 28;
  // Both qualities of one voice roll up into a single record, so a favourite,
  // a picture and a usage count belong to the voice rather than to a tier.
  return {
    id, key,
    identity_id: clone?.identity_id || "",
    name: clone?.name || savedName || (omniDescription ? id : technicalHistoricalId
      ? "Unavailable cloned voice" : voiceLabel(id)),
    detail: clone?.trait || clone?.notes || omniDescription || voiceDetail(id),
    cloned: isCloned(id),
    tier: clone?.target_model?.includes("flash") ? "flash" :
          omniDescription ? "plus" : voiceTier(id),
    engine: clone?.engine || (omniDescription ? "omni" : "audio"),
    tiers: omniDescription ? { plus: id, flash: id } :
           known ? known.tiers : { [voiceTier(id)]: id },
    age: clone?.age || known?.age || "",
    gender: clone?.gender || known?.gender || "", origin: known?.origin || "",
    accent: clone?.accent || "", scene: clone?.scene || known?.scene || "",
    sample: known?.sample || "",
    // Seven of the voices this app ships as defaults are not in Alibaba's
    // published catalogue — they were found by probing the API — so they have
    // no stock clip. Something you made with the voice is a better preview
    // anyway, and costs nothing.
    preview: known?.sample ? `/samples/${known.sample}`
             : use.mine ? `/audio/${use.mine}` : "",
    native: known ? readsEnglish(known) : false,
    gone,
    ...use,
  };
}

function ago(when) {
  if (!when) return "never used";
  const mins = Math.round((Date.now() - new Date(when)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/* One row, used by every group on this screen. */
function voiceRow(v) {
  const row = document.createElement("div");
  row.className = "vrow" + (voicePicked === v.id ? " on" : "");
  row.dataset.voice = v.id;
  if (v.gone) row.title = `Historical voice ID: ${v.id}`;
  const star = isFavourite(v.id);
  row.innerHTML =
    voiceAvatar(v.id, 34) +
    `<span class="body"><b>${escapeHtml(v.name)}</b>` +
    `<span>${v.gone ? "no longer available — its recordings still play"
       : `${Object.keys(v.tiers).map(t => t === "flash" ? "Flash" : "Plus")
            .sort().join(" · ")}` +
         (v.native ? " · native English" : "") + " · " +
         escapeHtml(v.detail || v.scene || (v.cloned ? "cloned by you" : "no description"))}` +
    `</span></span>` +
    (v.uses
      ? `<span class="use"><b>${v.uses}</b>${ago(v.last_used)}</span>`
      : `<span class="use">unused</span>`) +
    // Hearing a voice shouldn't cost a click into a panel and back.
    `<button class="icon-btn vrow-play"${v.preview ? "" : " disabled"} ` +
      `title="${v.preview ? (v.sample ? "Hear this voice"
                                      : "Hear the last thing you made with it")
                          : "Nothing to play yet — use \'say your own line\' below"}">` +
      `${icon("play")}</button>` +
    `<span class="star${star ? " on" : ""}" title="${star ? "In your favourites" : "Add to favourites"}">★</span>`;
  row.onclick = () => {
    // Picking for the composer? Choosing is the whole point — don't make the
    // person open a sheet and press another button.
    if (voiceBrowser.picking) return useVoice(v);
    showVoice(v.id);
  };
  const listen = row.querySelector(".vrow-play");
  if (v.preview) listen.onclick = event => {
    event.stopPropagation();
    player.toggle(v.preview, playing => {
      listen.innerHTML = icon(playing ? "pause" : "play");
      listen.title = playing ? "Pause this voice preview"
        : (v.sample ? "Hear this voice" : "Hear the last thing you made with it");
      listen.setAttribute("aria-label", listen.title);
    },
      { name: `${v.name}-preview`, title: v.name,
        meta: `${v.trait || "Voice"} · preview`, voice: v.id });
  };
  row.querySelector(".star").onclick = async event => {
    event.stopPropagation();
    const next = favourites();
    const on = !next.has(v.key);
    on ? next.add(v.key) : next.delete(v.key);
    config.voice_favourites = [...next];
    await api("/api/voice/save", { id: v.key, favourite: on });
    drawVoices();
    if (voicePicked === v.id) showVoice(v.id);
  };
  return row;
}

function voiceGroup(title, note, voices) {
  if (!voices.length) return null;
  const box = document.createElement("div");
  box.className = "vgroup";
  const heading = document.createElement("h3");
  heading.className = "block-heading";
  heading.innerHTML = `${escapeHtml(title)}<span>${escapeHtml(note)}</span>`;
  box.appendChild(heading);
  voices.forEach(v => box.appendChild(voiceRow(v)));
  return box;
}

function drawVoices() {
  const box = $("voiceGroups");
  box.innerHTML = "";
  drawVoiceFilters();

  const query = $("vqSearch").value.trim().toLowerCase();
  const matches = v =>
    (!query || `${v.name} ${v.detail} ${v.scene} ${v.id}`.toLowerCase().includes(query)) &&
    (!voiceFilters.tier || v.tiers[voiceFilters.tier]) &&
    (!voiceFilters.gender || v.gender === voiceFilters.gender) &&
    (!voiceFilters.origin || (voiceFilters.origin === "Native English"
        ? v.native : v.origin === voiceFilters.origin)) &&
    (!voiceFilters.scene || v.scene === voiceFilters.scene);

  const order = $("vqSort").value;
  const sort = list => list.sort((a, b) =>
    order === "name" ? a.name.localeCompare(b.name)
    : order === "recent" ? String(b.last_used || "").localeCompare(String(a.last_used || ""))
    : (b.uses - a.uses) || a.name.localeCompare(b.name));

  if (voiceMode === "picker") {
    const mine = sort(clonedIdentityRecords().filter(matches));
    const audioBuiltins = sort(catalogue.map(v =>
      voiceRecord(v.tiers.plus || v.tiers.flash)).filter(matches));
    const omniBuiltins = sort(Object.keys(
      config.capabilities?.omni?.system_voices || {}).map(voiceRecord).filter(matches));
    for (const group of [
      voiceGroup("Your cloned voices", `${mine.length}`, mine),
      voiceGroup("Built-in — Qwen 3.5 Omni", `${omniBuiltins.length}`, omniBuiltins),
      voiceGroup("Built-in — Qwen Audio", `${audioBuiltins.length} of ${catalogue.length}`,
                 audioBuiltins.slice(0, exploreShown)),
    ]) if (group) box.appendChild(group);
    if (!box.children.length) {
      box.innerHTML = '<div class="empty"><b>Nothing matches</b>Loosen a filter.</div>';
    }
    return;
  }

  if (voiceMode === "mine") {
    // One voice, one row. A clone arrives twice — once with its full id from
    // the service, once as a key from what you've made with it — and both used
    // to render.
    const shown = new Set();
    const once = list => list.filter(v => !shown.has(v.key) && shown.add(v.key));

    const mine = once(sort(clonedIdentityRecords().filter(matches)));
    const fav = once(sort([...favourites()].map(voiceRecord).filter(matches)));
    const used = once(sort(Object.keys(voiceUsage).map(voiceRecord).filter(matches)));

    for (const group of [
      voiceGroup("Cloned by you", `${mine.length}`, mine),
      voiceGroup("Favourites", `${fav.length}`, fav),
      voiceGroup("You have used", `${used.length}`, used),
    ]) if (group) box.appendChild(group);

    if (!box.children.length) {
      box.innerHTML = '<div class="empty"><b>Nothing here yet</b>' +
        'Clone a voice, star one you like, or make something in <b>Explore all</b> ' +
        '— anything you use shows up here automatically.</div>';
    }
    return;
  }

  // Explore: the whole catalogue, one tier at a time so the list stays honest
  // about which voices a given quality can actually speak with.
  const all = sort(catalogue.map(v => voiceRecord(v.tiers.plus || v.tiers.flash))
                            .filter(matches));
  if (!all.length) {
    box.innerHTML = '<div class="empty"><b>Nothing matches</b>Loosen a filter.</div>';
    return;
  }
  const group = voiceGroup("Every voice", `${all.length} of ${catalogue.length}`,
                           all.slice(0, exploreShown));
  box.appendChild(group);
  if (all.length > exploreShown) {
    const more = document.createElement("button");
    more.className = "ghost";
    more.style.cssText = "width:100%;margin-top:10px";
    more.textContent = `Show ${Math.min(120, all.length - exploreShown)} more ` +
                       `of ${all.length}`;
    more.onclick = () => { exploreShown += 120; drawVoices(); };
    box.appendChild(more);
  }
}

/* Filters as chips you can see and remove, instead of dropdowns whose state is
   invisible once you look away. */
function drawVoiceFilters() {
  const box = $("vqChips");
  box.innerHTML = "";
  const options = {
    tier: ["plus", "flash"],
    gender: [...new Set(library.map(v => v.gender))].filter(Boolean).sort(),
    origin: ["Native English", ...new Set(catalogue.map(v => v.origin))].filter(Boolean),
    scene: [...new Set(library.map(v => v.scene))].filter(Boolean).sort(),
  };
  const labels = { tier: "Quality", gender: "Gender", origin: "Voice origin",
                   scene: "Use" };
  for (const key of ["tier", "gender", "origin", "scene"]) {
    const chip = document.createElement("button");
    const set = voiceFilters[key];
    chip.className = "fchip" + (set ? " set" : "");
    chip.innerHTML = set
      ? `${labels[key]}: <b>${escapeHtml(set)}</b><span class="x">×</span>`
      : `+ ${labels[key]}`;
    chip.onclick = async () => {
      if (set) { voiceFilters[key] = ""; return drawVoices(); }
      const chosen = await ui.ask({
        title: `Filter by ${labels[key].toLowerCase()}`,
        choiceLabel: labels[key],
        choices: options[key].map(o => ({ value: o, label: o })),
        ok: "Apply",
      });
      if (chosen) { voiceFilters[key] = chosen; drawVoices(); }
    };
    box.appendChild(chip);
  }
}

/* One voice, everything about it: how it sounds, what you've made with it,
   what it cost, and the two or three things you'd ever want to do to it. */
function showVoice(id) {
  // Opening a different voice while one plays would leave the panel describing
  // one voice while another is speaking.
  if (voicePicked !== id) player.stop();
  voicePicked = id;
  const v = voiceRecord(id);
  const meta = (voiceMeta[v.key] || {});
  $("voiceDetailEmpty").style.display = "none";
  const box = $("voiceDetailBody");
  box.style.display = "";
  const star = isFavourite(id);
  const isDefault = config.chosen_default_voice === v.key;
  const both = Object.keys(v.tiers).length > 1;

  box.innerHTML =
    `<div class="vsheet">` +
      `<div class="face-wrap" id="vFace" title="Click or drop an image here">` +
        `${voiceAvatar(id, 108)}</div>` +
      `<h2 id="vName">${escapeHtml(meta.name || v.name)}</h2>` +
      `<p class="said-by">${escapeHtml(v.detail || v.scene ||
         (v.cloned ? "a voice you cloned" : "no description"))}</p>` +
      `<div class="marks">` +
        (v.gone ? `<span class="pill gone">no longer available</span>` : "") +
        (v.native ? `<span class="pill">native English</span>` : "") +
        (v.cloned ? `<span class="pill">cloned by you</span>` : "") +
        (v.age ? `<span class="pill">${escapeHtml(v.gender)}, ${v.age}</span>` : "") +
        (isDefault ? `<span class="pill asset-chip">your default</span>` : "") +
      `</div>` +
      `<p class="vusage">${v.uses
        ? `<b>${v.uses}</b> recording${v.uses === 1 ? "" : "s"} · ` +
          `<b>${v.folders}</b> Production${v.folders === 1 ? "" : "s"} · ` +
          `<b>$${v.spend.toFixed(4)}</b> · ${ago(v.last_used)}`
        : "you haven't used this one yet"}</p>` +
      `<button class="primary vbig" id="vHear"${v.preview ? "" : " disabled"}>` +
        `${v.sample ? "Hear it" : v.preview ? "Hear the last thing you made"
                                            : "Nothing to play yet"}</button>` +
    `</div>` +

    (both ? `<div class="vsection"><h3>Quality</h3>` +
      `<div class="filter-chips" id="vTierPick">` +
      ["plus", "flash"].filter(t => v.tiers[t]).map(t =>
        `<button class="fchip${v.tier === t ? " set" : ""}" data-tier="${t}">` +
        `${t === "plus" ? "Plus — richer" : "Flash — faster, cheaper"}</button>`).join("") +
      `</div></div>` : "") +

    `<div class="vsection"><h3>Hear it say your own line</h3>` +
      `<textarea id="vSayThis" rows="2" placeholder="Let your body settle now…"></textarea>` +
      `<div class="row" style="margin-top:8px">` +
        `<button class="ghost fit" id="vSayGo"${v.gone ? " disabled" : ""}>Say it</button>` +
        `<span class="hint" id="vSayCost" style="margin:0;align-self:center">` +
          `Alibaba's own clip is their phrase — often in Chinese. This says ` +
          `yours, and costs about $0.0002 on Flash.</span>` +
      `</div></div>` +

    `<div class="vsection"><h3>Your note</h3>` +
      `<textarea id="vNote" rows="2" placeholder="the narrator · the father in episode 3 · too bright for sleep"></textarea>` +
    `</div>` +

    `<div class="vsection vactions">` +
      `<button class="primary" id="vUse"${v.gone ? " disabled" : ""}>` +
        `Use in the composer</button>` +
      `<div class="vminor">` +
        `<button class="ghost" id="vStar">${star ? "★ Favourite" : "☆ Favourite"}</button>` +
        `<button class="ghost" id="vCompare">Compare</button>` +
        `<button class="ghost" id="vMakeDefault"${isDefault || v.gone ? " disabled" : ""}>` +
          `${isDefault ? "Your default" : "Make default"}</button>` +
        (v.cloned ? `<button class="ghost" id="cloneRerecord">Re-record</button>` : "") +
      `</div>` +
      (v.cloned ? `<button class="ghost danger" id="vDelete">Delete this clone</button>` : "") +
      `<div class="status" id="vStatus"></div>` +
    `</div>`;

  // The circle is the upload: click it, or drop an image on it.
  const face = $("vFace");
  face.onclick = () => pickVoiceImage(v.key);
  face.ondragover = e => { e.preventDefault(); face.classList.add("dropping"); };
  face.ondragleave = () => face.classList.remove("dropping");
  face.ondrop = e => {
    e.preventDefault();
    face.classList.remove("dropping");
    const file = e.dataTransfer.files[0];
    if (file) uploadVoiceImage(v.key, file);
  };

  if (both) $("vTierPick").querySelectorAll("[data-tier]").forEach(b =>
    b.onclick = () => { showVoiceAt(v.tiers[b.dataset.tier]); });

  $("vHear").onclick = () => v.preview && auditionPlay(v.preview, $("vHear"),
    { name: `${v.name}-preview`, title: v.name,
      meta: `${v.trait || "Voice"} · preview`, voice: v.id });

  $("vSayGo").onclick = async () => {
    const line = $("vSayThis").value.trim();
    if (!line) return setStatus("vStatus", "Write a line first.", "err");
    setStatus("vStatus", "Saying it…", "busy");
    const res = await spendGuarded("/api/voice/try",
      { text: line, voice: v.id, engine: v.engine, model: v.tier }, "Try a voice");
    if (res === null) return setStatus("vStatus", "Cancelled — nothing charged.", "");
    if (res.error) return setStatus("vStatus", res.error, "err");
    setStatus("vStatus", `Played — $${res.cost}. Kept in Unsorted.`, "ok");
    player.toggle(res.url, playing =>
      $("vSayGo").textContent = playing ? "Ⅱ Pause" : "Say it",
      { name: res.name || `${v.name}-test`, title: line,
        meta: `${v.name} · test generation`, voice: v.id });
  };

  $("vNote").value = meta.note || "";
  let noteTimer;
  $("vNote").addEventListener("input", () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(async () => {
      await api("/api/voice/save", { id: v.key, note: $("vNote").value });
      voiceMeta[v.key] = { ...(voiceMeta[v.key] || {}), note: $("vNote").value };
    }, 600);
  });

  $("vUse").onclick = () => useVoice(v);

  if (maybe("cloneRerecord")) $("cloneRerecord").onclick = () => {
    // Replacing the reference audio keeps the same voice id, so every
    // recording already made with it stays valid — and no slot is spent.
    voiceMode = "clone";
    $("voiceModes").querySelector('[data-mode="clone"]').click();
    setStatus("cloneStatus",
      `Record or upload the new audio, then press "Replace the audio of a ` +
      `voice you already made" — ${v.name} keeps its id and everything you ` +
      `made with it.`, "");
  };
  $("vCompare").onclick = () => addToCompare(v);

  $("vStar").onclick = async () => {
    const next = favourites();
    const on = !next.has(v.key);
    on ? next.add(v.key) : next.delete(v.key);
    config.voice_favourites = [...next];
    await api("/api/voice/save", { id: v.key, favourite: on });
    drawVoices(); showVoice(id);
  };

  $("vMakeDefault").onclick = async () => {
    await api("/api/prefs", { default_voice: v.key });
    config.chosen_default_voice = v.key;
    applyDefaultVoice();
    setStatus("vStatus", `${v.name} opens the composer from now on.`, "ok");
    showVoice(id);
  };

  if (maybe("vDelete")) $("vDelete").onclick = async () => {
    if (!await ui.confirm(`Delete the clone "${v.name}"?`,
          v.uses ? `You have ${v.uses} recording${v.uses === 1 ? "" : "s"} made with ` +
                   `it. Those keep playing — but you won't be able to make new ones ` +
                   `or another take in this voice.`
                 : "Nothing has been made with it yet.", "Delete")) return;
    const res = await api("/api/clone/delete", { id: v.id, voice_id: v.id });
    if (res.error) return setStatus("vStatus", res.error, "err");
    localStorage.setItem("vorvn:voices-revision", String(Date.now()));
    await loadCloned(); await loadVoiceUsage();
    voicePicked = null;
    $("voiceDetailBody").style.display = "none";
    $("voiceDetailEmpty").style.display = "";
    drawVoices();
  };

  drawVoices();
}

/* Switching quality keeps you on the same voice. */
function showVoiceAt(id) { showVoice(id); }

/* Put a voice into the composer, with the quality it actually speaks at. */
function useVoice(v) {
  const currentEngine = $("engine").value;
  const currentTier = $("model").value;
  const routes = v.bindings || [{ id: v.id, engine: v.engine || "audio", tier: v.tier }];
  const route = routes.find(item => item.engine === currentEngine && item.tier === currentTier) ||
    routes.find(item => item.engine === currentEngine) ||
    routes.find(item => item.engine === "omni" && item.tier === "plus") || routes[0];
  const providerId = route.id;
  $("engine").value = route.engine;
  $("model").value = route.tier;
  syncEngineUI();
  const select = $("voice");
  if (![...select.options].some(o => o.value === providerId)) {
    select.insertBefore(new Option(v.name, providerId), select.firstChild);
  }
  select.value = providerId;
  drawVoicePick();
  setStatus("status", `${v.name} is ready in the composer.`, "ok");
  if (voiceBrowser.picking) return voiceBrowser.choose(providerId);
  document.querySelector('nav button[data-tab="speak"]').click();
}

$("voiceModes").querySelectorAll("button").forEach(b => b.onclick = () => {
  $("voiceModes").querySelectorAll("button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  player.stop();          // the list you were listening to is going away
  voiceMode = b.dataset.mode;
  const cloning = voiceMode === "clone";
  // Cloned voices are limited by Alibaba; knowing how many you already have
  // matters before you spend another one.
  $("cloneQuota").style.display = cloning ? "" : "none";
  $("cloneQuota").innerHTML = cloning
    ? `You have <b>${clonedVoices.length}</b> cloned voice` +
      `${clonedVoices.length === 1 ? "" : "s"}. Alibaba caps how many an ` +
      `account may hold — if a new one is refused, delete an old one in ` +
      `<b>My voices</b> and try again.`
    : "";
  $("voiceModeClone").style.display = cloning ? "" : "none";
  $("voiceModeBrowse").style.display = cloning ? "none" : "";
  if (!cloning) drawVoices();
});
/* Opening the tab loads everything it needs, once. */
async function openVoicesTab() {
  // If a picker was dismissed in a way that skipped its handler, the list is
  // still sitting in the dialog. Bring it back before drawing anything.
  voiceBrowser.home();
  await loadCloned();
  if (!library.length) await loadLibrary();
  await loadVoiceUsage();
  drawVoices();
}
$("vqSearch").addEventListener("input", () => { exploreShown = 120; drawVoices(); });
$("vqSort").addEventListener("change", drawVoices);

/* Music owns its API, controls and library picker. Projects supplies only the
   active folder context and stale-navigation guard. */
const projectMusic = StudioProjectMusic.create({
  get: $, projectService, assetService,
  getProject: () => openProject,
  isCurrent: (id, request) => (request === undefined || request === projectRequest) &&
                              openProject?.id === id,
  player, ask: options => ui.ask(options),
  confirm: (...args) => ui.confirm(...args), setStatus, clock,
  onChange: () => {
    if (openProject?.container_type === "production") drawStrip(openProject.parts || []);
    setSequenceButton(false);
  },
  openLibrary: () => {
    const venture = projectModel.contextFor(openProject).venture;
    const library = projectModel.list.find(item =>
      Number(item.parent_id) === Number(venture?.id) &&
      item.container_type === "library");
    const music = projectModel.list.find(item =>
      Number(item.parent_id) === Number(library?.id) &&
      item.container_type === "asset_collection" &&
      item.system_role === "assets:music");
    if (music) return showProject(music.id);
    setStatus("projectStatus", "This Venture has no Music library yet.", "err");
  },
});

let timelineZoom = 1;

/* A real track view: parts and music share one clock. It remains intentionally
   lighter than a DAW, but every visible lane maps to production content. */
function drawStrip(parts) {
  const box = $("folderStrip");
  box.innerHTML = ProjectCore.timelineMarkup({
    parts, music: projectMusic.current, partSeconds, clock, voiceLabel, escapeHtml,
  });
  box.style.display = box.innerHTML ? "" : "none";
  if (!box.innerHTML) return;
  const stage = box.querySelector(".timeline-stage");
  if (stage) stage.style.width = `${timelineZoom * 100}%`;

  box.querySelectorAll("[data-jump]").forEach(bar => bar.onclick = () => {
    box.querySelectorAll(".timeline-clip.selected").forEach(item =>
      item.classList.remove("selected"));
    bar.classList.add("selected");
    const row = $("partsList").querySelector(`.part[data-part-id="${bar.dataset.jump}"]`);
    if (row) { row.scrollIntoView({ block: "center", behavior: "smooth" });
               row.classList.add("picked");
               setTimeout(() => row.classList.remove("picked"), 900); }
  });
  box.querySelectorAll("[data-timeline-action]").forEach(control => {
    const action = control.dataset.timelineAction;
    if (action === "music-volume" || action === "music-start") {
      const output = control.closest("label")?.querySelector("output");
      control.oninput = () => {
        if (output) output.textContent = action === "music-volume"
          ? `${control.value}%` : clock(Number(control.value));
      };
      control.onchange = () => {
        const target = action === "music-volume" ? $("musicLevel") : $("musicStart");
        target.value = control.value;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
      };
      return;
    }
    if (action === "music-play") {
      const playing = Boolean(projectMusic.current?.filename &&
        player.playing(`/audio/${projectMusic.current.filename}`));
      control.textContent = playing ? "Ⅱ" : "▶";
      control.title = playing ? "Pause the source track" : "Play the source track";
    }
    control.onclick = () => {
      if (action === "pick-music") return $("musicPick").click();
      if (action === "music-play") return $("musicPlay").click();
      if (action === "music-details") return openProjectPanel("music");
      if (action === "zoom-in") timelineZoom = Math.min(3, timelineZoom + .5);
      if (action === "zoom-out") timelineZoom = Math.max(1, timelineZoom - .5);
      if (stage) stage.style.width = `${timelineZoom * 100}%`;
    };
  });
}

/* The venture library is one reusable browser. Projects supplies a captured
   destination and the API adapters; the feature owns its interaction state. */
const assetBrowser = StudioAssetBrowser.create({
  get: $,
  loadAssets: projectId => assetService.list(projectId),
  insertAsset: request => assetService.insert(request),
  afterInsert: async ({ context }) => {
    await loadProjectTree();
    await showProject(context.projectId);
    setStatus("projectStatus",
      "Asset inserted — it stays linked to the venture library.", "ok");
  },
  playAsset: (asset, button) => player.toggle(`/audio/${asset.filename}`,
    playing => {
      button.textContent = playing ? "Ⅱ" : "▶";
      button.title = playing ? "Pause preview" : `Hear ${asset.title || asset.text || "this asset"}`;
    }, {
      name: asset.filename, title: asset.title || asset.text || "Library asset",
      meta: `${voiceLabel(asset.voice)} · Venture library`, voice: asset.voice,
    }),
  stopPlayer: () => player.stop(),
  voiceAvatar, voiceLabel, clock, escapeHtml,
});

function openAssets(at = null) {
  if (!openProject) return;
  assetBrowser.open({ projectId: openProject.id, projectName: openProject.name, at });
}

$("partAsset").onclick = () => openAssets(null);

/* ── choosing a project from the tree ────────────────────────────────── */

/* Opens the picker and resolves to a project id, or null if cancelled.
   `blocked` is a set of ids that can't be chosen, each with a reason. */
function pickProject({ title, body, ok = "Move here", current = null,
                       blocked = new Map(), topLevel = false } = {}) {
  return new Promise(resolve => {
    let chosen = null;
    $("pickerTitle").textContent = title;
    $("pickerBody").textContent = body || "";
    $("pickerSearch").value = "";
    $("pickerOk").textContent = ok;
    $("pickerOk").disabled = true;

    const draw = () => {
      const query = $("pickerSearch").value.trim().toLowerCase();
      const box = $("pickerTree");
      box.innerHTML = "";
      const add = (project, depth) => {
        const why = blocked.get(project.id);
        const row = projectViews.picker(project, {
          depth,
          blocked: why,
          current: project.id === current,
          selected: chosen === project.id,
          onSelect: () => {
          chosen = project.id;
          $("pickerOk").disabled = false;
          box.querySelectorAll(".picker-row").forEach(r =>
            r.setAttribute("aria-selected", "false"));
          row.setAttribute("aria-selected", "true");
          },
        });
        box.appendChild(row);
      };

      if (query) {
        // Searching flattens it — hierarchy would hide the very match you want.
        const hits = projectModel.search(query);
        hits.length ? hits.forEach(x => add(x, 0))
                    : box.innerHTML = '<div class="hint" style="padding:10px">Nothing matches.</div>';
        return;
      }
      if (topLevel) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "picker-row";
        row.setAttribute("aria-selected", String(chosen === "top"));
        row.innerHTML = `<span class="nm"><b>Top level</b> — not inside anything</span>` +
                        (current ? "" : `<span class="here">where it is now</span>`);
        row.onclick = () => {
          chosen = "top";
          $("pickerOk").disabled = false;
          box.querySelectorAll(".picker-row").forEach(r =>
            r.setAttribute("aria-selected", "false"));
          row.setAttribute("aria-selected", "true");
        };
        box.appendChild(row);
      }
      const walk = (parent, depth) => {
        for (const project of projectModel.childrenOf(parent)) {
          add(project, depth);
          walk(project.id, depth + 1);
        }
      };
      walk(null, 0);
    };

    draw();
    $("pickerSearch").oninput = draw;
    const close = value => {
      $("pickerDialog").close();
      $("pickerOk").onclick = $("pickerCancel").onclick = null;
      $("pickerSearch").oninput = null;
      resolve(value);
    };
    $("pickerOk").onclick = () => close(chosen);
    $("pickerCancel").onclick = () => close(null);
    $("pickerDialog").addEventListener("close", () => resolve(null), { once: true });
    $("pickerDialog").showModal();
    $("pickerSearch").focus();
  });
}

/* Only folders hold recordings. Everything else is offered greyed out with the
   reason, so the tree still reads as a whole instead of hiding its own shape. */
function notFolders(extra = new Map()) {
  const blocked = new Map(extra);
  for (const p of projectModel.list) {
    if (blocked.has(p.id)) continue;
    if (!["production", "inbox"].includes(p.container_type))
      blocked.set(p.id, `A ${levelOf(p).one} holds ${levelOf(p).holdsMany}, ` +
                        `not recordings`);
  }
  return blocked;
}

/* ── selecting parts, and acting on several at once ──────────────────── */
const picked = new Set();
let dragging = null;
let lastPicked = null;

function drawSelectBar() {
  const count = picked.size;
  $("selectBar").style.display = count ? "flex" : "none";
  $("partsList").classList.toggle("picking", count > 0);
  $("selectCount").textContent = `${count} selected`;
  const all = (openProject?.parts || []).filter(p => p.kind !== "stitch");
  $("selectAll").textContent = count >= all.length ? "Select none" : "Select all";
  $("selectMove").disabled = !count;
  $("selectDelete").disabled = !count;
}

function clearPicked() {
  picked.clear();
  lastPicked = null;
  $("partsList").querySelectorAll(".part.picked").forEach(r => {
    r.classList.remove("picked");
    const box = r.querySelector(".part-pick input");
    if (box) box.checked = false;
  });
  drawSelectBar();
}

document.addEventListener("click", () => {
  document.querySelectorAll(".row-menu").forEach(m => m.remove());
  document.querySelectorAll("[data-open='1']").forEach(b => delete b.dataset.open);
});

$("selectClear").onclick = clearPicked;
// Escape drops a selection, as long as it isn't busy closing a dialog.
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !picked.size) return;
  if (document.querySelector("dialog[open]")) return;
  clearPicked();
});
$("selectAll").onclick = () => {
  const all = (openProject.parts || []).filter(p => p.kind !== "stitch");
  if (picked.size >= all.length) return clearPicked();
  all.forEach(p => picked.add(p.id));
  renderParts(openProject.parts);
  drawSelectBar();
};

$("selectDelete").onclick = async () => {
  const ids = [...picked];
  const gaps = (openProject.parts || [])
    .filter(p => ids.includes(p.id) && p.kind === "silence").length;
  const audio = ids.length - gaps;
  const what = [audio ? `${audio} recording${audio === 1 ? "" : "s"}` : "",
                gaps ? `${gaps} gap${gaps === 1 ? "" : "s"}` : ""]
                .filter(Boolean).join(" and ");
  if (!await ui.confirm(`Delete ${what}?`,
        "The audio files go too, along with any older takes. The parts below " +
        "move up to close the gap.", "Delete " + ids.length)) return;
  const res = await partService.removeMany(ids);
  if (res.error) return setStatus("projectStatus", res.error, "err");
  clearPicked();
  setStatus("projectStatus", `Deleted ${res.deleted} part${res.deleted === 1 ? "" : "s"}.`, "ok");
  showProject(openProject.id);
};

$("selectMove").onclick = async () => {
  const ids = [...picked];
  if (projectModel.list.length < 2) return setStatus("projectStatus",
    "There's nowhere else to put them yet — make another project first.", "err");
  const target = await pickProject({
    title: `Move ${ids.length} part${ids.length === 1 ? "" : "s"}`,
    body: `They leave "${openProject.name}" and are added to the end of ` +
          `whichever Production you choose, keeping their order.`,
    current: openProject.id,
    blocked: notFolders(new Map([[openProject.id, "They're already here"]])),
    ok: `Move ${ids.length} here`,
  });
  if (!target) return;
  const res = await partService.moveMany(ids, Number(target));
  if (res.error) return setStatus("projectStatus", res.error, "err");
  clearPicked();
  const name = (projectModel.byId.get(Number(target)) || {}).name || "there";
  setStatus("projectStatus", `Moved ${res.moved} into "${name}".`, "ok");
  showProject(openProject.id);
  loadProjectTree();
};

/* Dropping a dragged part: pull it out, put it back where it landed. */
async function dropPart(sequence, movedId, targetId, after) {
  if (movedId === null || movedId === targetId) return;
  const order = sequence.map(p => p.id).filter(id => id !== movedId);
  const at = order.indexOf(targetId) + (after ? 1 : 0);
  order.splice(at, 0, movedId);
  await projectService.reorder(openProject.id, order);
  showProject(openProject.id);
}

/* ── translating a part's subtitles ──────────────────────────────────── */
async function moveP(parts, index, delta) {
  const order = parts.map(p => p.id);
  [order[index], order[index + delta]] = [order[index + delta], order[index]];
  await projectService.reorder(openProject.id, order);
  showProject(openProject.id);
}

/* Creating names what it makes. What you get depends only on where you are —
   top level makes a venture, inside a venture a project, inside a project a
   Production — so there is nothing to pick and nothing to get wrong. */
const NEW_HINT = {
  venture: { placeholder: "Your venture name",
             body: "A venture represents one brand or business, not a folder. After creating it, " +
                   "you'll set its logo, naming rules and identity." },
  project: { placeholder: "YouTube",
             body: "A project is one channel, show or product. Productions live inside it." },
  production: { placeholder: "Ep 3 — The Lighthouse",
             body: "A Production is one finished piece. Its recordings play in order." },
};

async function newProject(inside) {
  const making = inside ? levelOf(openProject).holds : "venture";
  const hint = NEW_HINT[making];
  const name = await ui.ask({
    title: inside ? `New ${making} in "${openProject.name}"` : "Create a venture",
    body: hint.body,
    label: "Name it",
    placeholder: hint.placeholder,
    ok: `Create ${making}`,
  });
  if (!name) return;
  const res = await projectService.create({
    name, parentId: inside ? openProject.id : null,
  });
  if (res.error) return setStatus("projectStatus", res.error, "err");
  if (res.id) {
    if (inside) expanded.add(openProject.id), rememberBranches();
    await loadProjectTree();
    await showProject(res.id);
    if (!inside) openSettings(res.id);
  }
}
$("projectNew").onclick = () => newProject(true);
$("projectNewTop").onclick = () => newProject(false);
$("projectNewEmpty").onclick = () => newProject(false);
// Editing the title IS renaming — a separate field and button for the same
// thing was the clumsiest part of the old layout.
let renameTimer;
$("projectName").addEventListener("input", event => {
  if (!openProject) return;
  const id = openProject.id;
  const name = event.currentTarget.value;
  clearTimeout(renameTimer);
  renameTimer = setTimeout(async () => {
    await projectService.rename(id, name);
    if (openProject?.id === id) openProject.name = name;
    loadProjectTree();
  }, 600);
});
$("projectName").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });

/* The description grows with what's in it, so nothing is hidden behind a
   scrollbar in a two-line box. */
function growDesc() {
  const box = $("projectDesc");
  box.style.height = "auto";
  // +2 covers the border, or the last line sits under a hidden overflow.
  box.style.height = Math.max(30, box.scrollHeight + 2) + "px";
}
let describeTimer;
$("projectDesc").addEventListener("input", event => {
  growDesc();
  if (!openProject) return;
  const id = openProject.id;
  const description = event.currentTarget.value;
  clearTimeout(describeTimer);
  describeTimer = setTimeout(async () => {
    await projectService.describe(id, description);
    if (openProject?.id === id) openProject.description = description;
  }, 600);
});

/* ── a project's picture: an emoji, or an image of your own ───────────── */
const PROJECT_EMOJI = (
  "📁 📂 🗂 📌 ⭐️ 🔥 💤 🌙 ☁️ 🌊 🎧 🎙 🎬 🎵 🎼 📻 📖 📚 ✍️ 📝 " +
  "🙏 ✝️ ☪️ 🕉 ✡️ 🧘 🕯 💫 ✨ 🌱 🌳 🍃 ☀️ 🌅 🏔 🧠 💡 ❤️ 🩺 🧪 " +
  "🏷 🎯 🚀 🧩 🛠 ⚙️ 📦 🗃 🏢 👥"
).split(" ").filter(Boolean);

let pickedIcon = "";
let iconFor = null;
function openIconPicker(project) {
  if (!project) return;
  iconFor = project;
  const brand = project.level === "venture" && !isBucket(project);
  const isImage = (project.icon || "").startsWith("/") ||
                  (project.icon || "").startsWith("data:");
  pickedIcon = brand && !isImage ? "" : project.icon || "";
  $("iconTitle").textContent = brand ? "Venture logo" : "Project picture";
  $("emojiSection").style.display = brand ? "none" : "";
  $("iconUploadLabel").textContent = brand ? "Upload the venture logo" : "Or upload an image";
  $("iconSave").textContent = brand ? "Save logo" : "Save";
  $("iconClear").textContent = brand ? "Remove logo" : "Remove picture";
  $("iconHint").textContent = brand
    ? "Use a square logo. It identifies the venture throughout the workspace."
    : "Square works best. It's stored with the project and shown everywhere it appears.";
  $("iconWhere").textContent = brand
    ? `The logo for "${project.name}". Projects and folders inside keep their own symbols.`
    : `Shown wherever "${project.name}" appears — inside its venture and in Browse.`;
  $("iconFile").value = "";
  $("emojiGrid").innerHTML = PROJECT_EMOJI.map(e =>
    `<button type="button" data-emoji="${e}" aria-pressed="${e === pickedIcon}">${e}</button>`
  ).join("");
  $("emojiGrid").querySelectorAll("[data-emoji]").forEach(b => b.onclick = () => {
    pickedIcon = b.dataset.emoji;
    $("emojiGrid").querySelectorAll("[data-emoji]").forEach(o =>
      o.setAttribute("aria-pressed", String(o === b)));
  });
  $("iconDialog").showModal();
}
$("projectIcon").onclick = () => openIconPicker(openProject);
$("iconCancel").onclick = () => $("iconDialog").close();
$("iconClear").onclick = async () => { await saveIcon(""); };
$("iconSave").onclick = async () => {
  const file = $("iconFile").files[0];
  if (file) {
    const res = await projectService.uploadIcon(file, file.name);
    if (res.error) return setStatus("projectStatus", res.error, "err");
    pickedIcon = res.url;
  }
  await saveIcon(pickedIcon);
};
StudioFileDrop.bind({
  target: $("iconFileDrop"), input: $("iconFile"),
  onFiles: files => {
    const file = files[0];
    if (file) $("iconUploadLabel").textContent = `${file.name} selected`;
  },
});
async function saveIcon(value) {
  if (!iconFor) return;
  const id = iconFor.id;
  await projectService.setIcon(id, value);
  $("iconDialog").close();
  await loadProjectTree();
  if (openProject?.id === id) showProject(id);
}
/* ── settings for a project, in one place instead of scattered ───────── */
let settingsFor = null;

async function openSettings(id) {
  const project = projectModel.byId.get(Number(id));
  if (!project) return;
  settingsFor = project;
  const label = project.container_type === "venture" ? "Venture settings" :
                `${levelOf(project).one[0].toUpperCase()}${levelOf(project).one.slice(1)} settings`;
  $("settingsTitle").textContent = `${label} — ${project.name}`;
  const brand = project.container_type === "venture";
  $("setPicture").textContent = project.container_type === "venture"
    ? "Change logo" : "Change picture";
  $("setDelete").textContent = `Delete this ${levelOf(project).one}`;
  $("setDescLabel").textContent = brand ? "Venture description" : "Description";
  $("setDesc").placeholder = brand
    ? "What this venture is and what it creates"
    : `What this ${levelOf(project).one} is for — shown on its card`;
  $("setParentField").style.display = brand ? "none" : "";
  $("setMoveHint").style.display = brand ? "none" : "";
  const kids = projectModel.childrenOf(project.id).length;
  $("settingsWhere").textContent =
    `${project.all_parts} part${project.all_parts === 1 ? "" : "s"}` +
    (kids ? `, across ${kids} project${kids === 1 ? "" : "s"} inside` : "") +
    `. $${project.all_cost.toFixed(4)} spent on audio generation.`;
  $("setName").value = project.name;
  $("setDesc").value = project.description || "";
  setStatus("setStatus", "", "");

  wantedParent = project.parent_id || null;
  drawParentButton();
  // Only a venture signs files — a folder inherits from the venture above it.
  const isVenture = project.container_type === "venture";
  $("ventureNaming").style.display = isVenture ? "" : "none";
  if (isVenture) {
    const own = await projectService.naming(project.id);
    writeNaming("vn", own.naming || {}, config.naming || {});
  }
  $("settingsDialog").showModal();
}

function descendantsOf(id) {
  return projectModel.descendantsOf(id).map(project => project.id);
}
function pathOf(project) {
  return projectModel.pathOf(project);
}

/* Where the project will live once you save. Chosen from the same tree picker
   parts are moved with — one way to point at a project, not two. */
let wantedParent = null;

function drawParentButton() {
  const parent = projectModel.byId.get(Number(wantedParent));
  $("setParent").textContent = parent ? pathOf(parent) : "Top level — no parent";
}

$("setParent").onclick = async () => {
  const mine = levelOf(settingsFor);
  // A venture belongs at the top; a project inside a venture; a folder inside
  // a project. Anything else is shown greyed out saying why.
  const wantedParentLevel = { project: "venture", folder: "project" }[settingsFor.level];
  const blocked = new Map([[settingsFor.id, `A ${mine.one} can't live inside itself`]]);
  for (const id of descendantsOf(settingsFor.id))
    blocked.set(id, `This one is inside the ${mine.one} you're moving`);
  for (const p of projectModel.list) {
    if (blocked.has(p.id)) continue;
    if (isBucket(p)) { blocked.set(p.id, "Unsorted only holds loose recordings"); continue; }
    if (p.level !== wantedParentLevel)
      blocked.set(p.id, `A ${mine.one} lives in a ${wantedParentLevel || "—"}, ` +
                        `and this is a ${levelOf(p).one}`);
  }
  const chosen = await pickProject({
    title: `Where should "${settingsFor.name}" live?`,
    body: settingsFor.level === "venture"
      ? "A venture always sits at the top level, so there is nowhere else to put it."
      : `Everything inside it comes along. A ${mine.one} lives in a ` +
        `${wantedParentLevel}.`,
    current: settingsFor.parent_id,
    blocked, ok: "Put it here",
    topLevel: settingsFor.level === "venture",
  });
  if (chosen === null) return;
  wantedParent = chosen === "top" ? null : chosen;
  drawParentButton();
};

$("projectSettings").onclick = () => openProject && openSettings(openProject.id);
$("setCancel").onclick = () => $("settingsDialog").close();
$("setPicture").onclick = () => {
  const project = settingsFor;
  $("settingsDialog").close();
  openIconPicker(project);
};

$("setSave").onclick = async () => {
  const id = settingsFor.id;
  const name = $("setName").value.trim();
  if (!name) return setStatus("setStatus", "A project needs a name.", "err");
  if (name !== settingsFor.name) await projectService.rename(id, name);
  if ($("setDesc").value !== (settingsFor.description || ""))
    await projectService.describe(id, $("setDesc").value);
  if (settingsFor.level === "venture") {
    await projectService.setNaming(id, readNaming("vn", { blankMeansInherit: true }));
  }
  if (String(wantedParent || "") !== String(settingsFor.parent_id || "")) {
    const moved = await projectService.move(id, wantedParent);
    if (moved.error) return setStatus("setStatus", moved.error, "err");
  }
  $("settingsDialog").close();
  await loadProjectTree();
  showProject(openProject && openProject.id === id ? id : id);
};

$("setDelete").onclick = async () => {
  const id = settingsFor.id, name = settingsFor.name;
  const parent = settingsFor.parent_id;
  if (!await ui.confirm(`Delete "${name}"?`,
        "Every audio file inside is kept and moved to Unsorted. This container " +
        "and its nested Project/Production structure are removed.")) return;
  $("settingsDialog").close();
  await projectService.remove(id, { keepAudio: true });
  await loadProjectTree();
  // Land where the folder used to be, not on some unrelated project.
  parent ? showProject(parent) : showHome();
};

$("partAdd").onclick = () => {
  if (!openProject) return setStatus("projectStatus", "Open a project first.", "err");
  composer.open({ project: openProject, at: null,
                  title: `New part ${nextPartNumber(openProject)}` });
};

$("partSilence").onclick = async () => {
  if (!openProject) return setStatus("projectStatus", "Open a project first.", "err");
  const res = await projectService.addSilence(
    openProject.id, parseFloat($("silenceSeconds").value) || 4);
  if (res.error) return setStatus("projectStatus", res.error, "err");
  showProject(openProject.id);
  setStatus("projectStatus", `Added ${res.seconds}s of silence — costs nothing.`, "ok");
};

$("recordDrafts").onclick = recordAllDrafts;
$("projectStitch").onclick = async () => {
  if (!openProject) return;
  setStatus("projectStatus", "Stitching…", "busy");
  const res = await projectService.stitch(openProject.id);
  if (res.error) return setStatus("projectStatus", res.error, "err");
  play(res.url, res.name, `${res.parts} parts`, "");
  showProject(openProject.id);
  // The subtitles are joined on the same clock as the audio, so one file
  // covers the whole thing — parts still missing theirs are named, not hidden.
  let note = `Joined ${res.parts} parts into one file — ${res.size_mb} MB.`;
  if (res.subtitles) {
    note += ` Subtitles for the whole run: ${res.subtitles} lines.`;
    if ((res.missing_subtitles || []).length)
      note += ` Part${res.missing_subtitles.length === 1 ? "" : "s"} ` +
              `${res.missing_subtitles.join(", ")} ha` +
              `${res.missing_subtitles.length === 1 ? "s" : "ve"} none yet.`;
    // Out-of-date subtitles are worse than missing ones: they look finished.
    if ((res.stale_subtitles || []).length)
      note += ` Part${res.stale_subtitles.length === 1 ? "" : "s"} ` +
              `${res.stale_subtitles.join(", ")} ` +
              `${res.stale_subtitles.length === 1 ? "was" : "were"} re-recorded ` +
              `after the subtitles were made — those lines describe the old audio.`;
  }
  setStatus("projectStatus", note, "ok");
  if (res.srt_url) {
    const link = document.createElement("a");
    link.href = res.srt_url; link.download = "";
    link.textContent = " Download subtitles (.srt)";
    link.style.cssText = "margin-left:8px;color:var(--accent-2)";
    $("projectStatus").appendChild(link);
  }
};

/* ── hearing the whole mix before publishing an Export ───────────────── */
/* The server renders a disposable preview through the Export audio pipeline.
   The shared player then has one seekable file whose silence, linked assets
   and background mix all live on the same clock. */
let sequence = null;

function setSequenceButton(playing) {
  const previewLabel = projectMusic.current?.filename
    ? "▶ Preview with music" : "▶ Preview sequence";
  const preparing = Boolean(sequence && !sequence.ready);
  const idle = preparing ? "Preparing…" : sequence ? "▶ Resume" : "Play all";
  for (const id of ["playAll", "sequencePlayAll", "shellPlayAll"])
    if (maybe(id)) $(id).disabled = preparing;
  if (maybe("playAll")) $("playAll").textContent = playing ? "Ⅱ Pause" : idle;
  if (maybe("sequencePlayAll"))
    $("sequencePlayAll").textContent = playing ? "Ⅱ Pause" : preparing ? "Preparing…" : sequence ? "▶ Resume" : previewLabel;
  if (maybe("shellPlayAll"))
    $("shellPlayAll").textContent = playing ? "Ⅱ Pause" : preparing ? "Preparing…" : sequence ? "▶ Resume" : "▶ Preview";
}

function stopSequence() {
  if (!sequence) return;
  clearTimeout(sequence.gap);
  sequence = null;
  document.querySelectorAll(".part.playing").forEach(p => p.classList.remove("playing"));
  setSequenceButton(false);
}

function stopPlayAll() { player.stop(); }

async function playAll(parts) {
  stopPlayAll();
  if (!parts.some(part => !["stitch", "draft"].includes(part.kind))) return;
  const projectId = openProject.id;
  sequence = { gap: null, preview: true, ready: false };
  const mine = sequence;
  setSequenceButton(false);
  setStatus("projectStatus",
    projectMusic.current?.filename
      ? "Preparing the current sequence and music mix… no AI call or charge."
      : "Preparing the current sequence… no AI call or charge.", "busy");
  const result = await projectService.preview(projectId);
  if (sequence !== mine || openProject?.id !== projectId) return;
  if (!result || result.error) {
    stopSequence();
    return setStatus("projectStatus", result?.error || "Preview could not be prepared.", "err");
  }
  const note = `${result.parts} parts` +
    (result.music ? " · music mixed" : "") +
    (result.skipped_drafts
      ? ` · ${result.skipped_drafts} draft${result.skipped_drafts === 1 ? "" : "s"} skipped`
      : "");
  mine.ready = true;
  player.load({
    url: result.url, name: result.name,
    title: `${openProject.name} — production preview`,
    meta: note, downloadable: false,
  }, { keepSequence: true, render: setSequenceButton, onEnded: () => {
    if (sequence !== mine) return;
    stopSequence();
    setStatus("projectStatus", "Preview reached the end.", "");
  }});
  setStatus("projectStatus",
    `Preview ready: ${note}. It matches the current mix and is not an Export.`, "ok");
}

$("playAll").onclick = () => {
  if (sequence) {
    if (player.audio.paused) player.audio.play().catch(() => setSequenceButton(false));
    else player.audio.pause();
    return;
  }
  if (!openProject?.parts?.length) return;
  playAll(openProject.parts);
};
$("sequencePlayAll").onclick = () => $("playAll").click();
$("shellPlayAll").onclick = () => $("playAll").click();

/* ── one audio, all of its detail ─────────────────────────────────────── */
let openAudioRow = null;

$("audioTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
  $("audioTabs").querySelectorAll("button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  $("audioViewWhat").style.display = b.dataset.view === "what" ? "" : "none";
  $("audioViewTakes").style.display = b.dataset.view === "takes" ? "" : "none";
  $("audioViewHow").style.display = b.dataset.view === "how" ? "" : "none";
});

/* When a take was made, in your clock — the list used the server's, so the same
   recording appeared to have two different times. */
const stamp = when => new Date(when).toLocaleString(undefined,
  { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/* Takes have two densities, but one identity and one action contract. The
   component renders them; this composition layer supplies the shared Player. */
const takeCards = StudioTakeCard.create({
  voiceAvatar,
  voiceLabel,
  icon,
  clock,
  stamp,
  bindAudio(button, take, { detailed, current }) {
    StudioAudioTrigger.bind({
      button,
      player,
      getTrack: () => ({
        url: `/audio/${take.filename}`,
        name: take.filename,
        title: take.text || "Take",
        meta: `${voiceLabel(take.voice)} · ${current ? "in use now" : stamp(take.when)}`,
        voice: take.voice,
      }),
      render: playing => {
        if (detailed) button.textContent = playing ? "Pause" : "Play";
        else {
          button.innerHTML = icon(playing ? "pause" : "play");
          button.title = playing ? "Pause" : "Play this take";
        }
      },
    });
  },
});

async function openAudio(id) {
  const row = await partService.full(id);
  if (row.error) return;
  openAudioRow = row;

  // The words are what this is, so they name it. The filename is a detail and
  // lives under "How it was made" with everything else.
  const words = (row.text || "").trim();
  $("audioTitle").textContent =
    row.title || (words ? words.slice(0, 60) + (words.length > 60 ? "…" : "")
                        : row.filename);
  const part = (openProject?.parts || []).find(x => x.id === row.id);
  const place = openProject
    ? [...(openProject.trail || []).map(t => t.name), openProject.name].join(" › ")
    : "";
  const index = part && part.position !== null
    ? `Part ${(openProject.parts.filter(x => x.kind !== "stitch")
              .indexOf(part)) + 1}` : "";
  $("audioWhere").textContent =
    [index, place, stamp(row.created_at),
     `${(row.size_bytes / 1e6).toFixed(2)} MB`].filter(Boolean).join(" · ");
  const detailTrack = {
    url: `/audio/${row.filename}`, name: row.filename,
    title: row.title || words || row.filename,
    meta: [voiceLabel(row.voice), row.model?.toUpperCase(),
           row.cost ? `$${Number(row.cost).toFixed(4)}` : ""].filter(Boolean).join(" · "),
    voice: row.voice,
  };
  player.load(detailTrack, { autoplay: false });
  player.mount($("audioPlayerSlot"));
  // The server decides the name and writes the tags; the browser just saves it.
  $("audioDownload").href = `/download?id=${row.id}`;
  $("audioDownload").removeAttribute("download");
  api(`/api/download/name?id=${row.id}`).then(readable => {
    if (readable && readable.filename)
      $("audioDownload").title = `Saves as ${readable.filename}`;
  });
  $("audioText").textContent = words || "(no text)";

  // The same chips as the row behind it, so the modal never disagrees with the
  // list — including what was really spent across every take.
  const takeCount = (part?.takes || 0) + 1;
  $("audioChips").innerHTML =
    `<span class="part-who" style="margin:0">${voiceAvatar(row.voice, 24)}` +
      `<span class="nm">${escapeHtml(voiceLabel(row.voice))}</span></span>` +
    `<span>${clock((row.duration_ms || 0) / 1000)}</span>` +
    `<span title="What this take cost">$${Number(row.cost).toFixed(4)} this take</span>` +
    (part && part.spent > row.cost + 1e-9
      ? `<span title="Every take of this part added up">` +
        `$${part.spent.toFixed(4)} spent in total</span>` : "") +
    (part?.subtitled
      ? `<span class="pill${part.subtitles_stale ? " stale" : ""}">` +
        `${part.subtitles_stale ? "subtitles out of date" : "subtitles"}</span>` : "") +
    ((part?.languages || []).length
      ? `<span class="pill">${part.languages.join(", ")}</span>` : "");

  $("audioTakesTab").textContent =
    takeCount > 1 ? `Takes (${takeCount})` : "Takes";
  drawModalTakes(row, part);

  const shown = [
    ["Voice", voiceLabel(row.voice) === row.voice ? row.voice
              : `${voiceLabel(row.voice)} — ${row.voice}`],
    ["Quality", row.model === "plus" ? "Plus" : "Flash"],
    ["Language", row.language || "Auto"], ["Direction", row.instruction || "none"],
    ["Speed", `${row.rate}×`], ["Pitch", `${row.pitch}×`], ["Volume", row.volume],
    ["Seed", row.seed || "0 — fresh each time"], ["Format", row.format],
    ["Characters", row.chars], ["Requests", row.requests], ["File", row.filename],
  ];
  $("audioParams").innerHTML = shown.map(([k, v]) =>
    `<div class="item"><span class="hint" style="margin:0">` +
    `<b style="color:var(--text)">${k}</b> — ${escapeHtml(String(v))}</span></div>`).join("");
  if ((row.failures || []).length) {
    $("audioParams").innerHTML +=
      `<div class="item"><span class="hint" style="margin:0;color:var(--bad)">` +
      `${row.failures.length} chunk(s) failed and are missing from this file</span></div>`;
  }
  setStatus("audioStatus", "");
  if (!$("audioDialog").open) $("audioDialog").showModal();
}

/* Every take of this part, each with its own words — a take can change the
   text, not just the voice, and nothing showed that. */
async function drawModalTakes(row, part) {
  const box = $("audioTakes");
  box.innerHTML = '<div class="hint">Loading…</div>';
  const data = await partService.takes(row.id);
  const older = data.takes || [];
  box.innerHTML = "";

  const card = (take, current) => takeCards.render(take, {
    current,
    variant: "detail",
    onUse: current ? null : async () => {
        const res = await partService.promote(take.id);
        setStatus("audioStatus",
          "Swapped — the one it replaced is kept as a take." +
          (res.subtitles_stale ? " Its subtitles are now marked out of date." : ""),
          "ok");
        if (openProject) await showProject(openProject.id);
        openAudio(row.id);
      },
    onDelete: current ? null : async () => {
        if (!await ui.confirm("Delete this take?",
              "Only this take goes — the part and its other takes stay.",
              "Delete take")) return;
        await partService.remove(take.id, { deleteFile: true });
        if (openProject) await showProject(openProject.id);
        openAudio(row.id);
      },
  });

  box.appendChild(card({ ...row, when: row.created_at }, true));
  older.forEach(take => box.appendChild(card(take, false)));
  if (!older.length) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Only one take so far. \"Edit & make a new take\" adds " +
      "another without losing this one.";
    box.appendChild(note);
  }
}

$("audioClose").onclick = () => $("audioDialog").close();
$("audioDialog").addEventListener("close", () => player.home());
/* Editing a part means opening the composer on it — the same composer as
   everywhere else, not a detour through the Speak tab. */
$("audioReload").onclick = () => {
  const row = openAudioRow;
  $("audioDialog").close();
  const part = (openProject?.parts || []).find(x => x.id === row.id);
  if (part && openProject) {
    const number = openProject.parts.filter(x => x.kind !== "stitch").indexOf(part) + 1;
    return composer.open({ project: openProject, part,
                           title: `Part ${number} — another take` });
  }
  // Not open in a project — load it into the composer where it stands.
  reloadGeneration(row.id);
  document.querySelector('nav button[data-tab="speak"]').click();
};

$("audioMove").onclick = async () => {
  const row = openAudioRow;
  const here = openProject ? openProject.id : null;
  const target = await pickProject({
    title: "Move this recording",
    body: "It leaves where it is now and is added to the end of the Production " +
          "you choose. Its takes go with it.",
    current: here,
    blocked: notFolders(here ? new Map([[here, "It's already here"]]) : new Map()),
    ok: "Move it here",
  });
  if (!target) return;
  await partService.move(row.id, Number(target));
  const name = (projectModel.byId.get(Number(target)) || {}).name || "there";
  setStatus("audioStatus", `Moved into "${name}".`, "ok");
  await loadProjectTree();
  if (openProject) showProject(openProject.id);
};
$("audioDelete").onclick = async () => {
  const takes = ((openProject?.parts || []).find(x => x.id === openAudioRow.id)?.takes) || 0;
  if (!await ui.confirm("Delete this part?",
        "The audio file goes from disk" +
        (takes ? `, along with its ${takes} older take${takes === 1 ? "" : "s"}` : "") +
        ". Any subtitles and translations go too.")) return;
  await partService.remove(openAudioRow.id, { deleteFile: true });
  if (player.track?.name === openAudioRow.filename) player.stop({ reset: true });
  $("audioDialog").close();
  if (openProject) showProject(openProject.id);
  refreshHistory();
};

const settingsController = StudioSettings.create({
  get: $, api, setStatus, escapeHtml, config,
  loadCloned: () => loadCloned(),
});

/* ── importing documents ──────────────────────────────────────────────── */
const IMPORTABLE = /\.(txt|md|markdown|text|docx|pdf)$/i;

async function importFile(file) {
  // Dropping a document while a Production is open fills it with draft parts.
  const onScript = $("tab-projects").classList.contains("on")
                   && openProject?.container_type === "production";
  const target = onScript ? "scriptStatus" : "status";
  if (!IMPORTABLE.test(file.name)) {
    return setStatus(target, `Can't read ${file.name}. Use .txt, .md, .docx or .pdf.`, "err");
  }
  setStatus(target, `Reading ${file.name}…`, "busy");

  const res = await fetch("/api/import", {
    method: "POST",
    // Headers are latin-1 only, so a filename with accents must be encoded.
    headers: { "X-Filename": encodeURIComponent(file.name) },
    body: file,
  }).then(r => r.json());

  if (res.error) return setStatus(target, res.error, "err");

  if (onScript) {
    // Dropping a document used to fill the Script tab. That tab is gone, so it
    // fills a folder instead — one part per block, each a draft until recorded.
    if (!openProject || openProject.container_type !== "production") {
      return setStatus(target,
        "Open a Production in Projects first — that's where the parts will land.", "err");
    }
    for (const text of res.blocks) {
      await partService.draft({ ...composerSettings(), text,
                                     project_id: openProject.id });
    }
    await showProject(openProject.id);
    setStatus(target,
      `Added ${res.block_count} parts from ${res.name}, all drafts — record ` +
      `them when you're ready.`, "ok");
  } else {
    $("text").value = res.text;
    updateCount();
    setStatus(target,
      `Loaded ${res.chars.toLocaleString()} characters from ${res.name}.`, "ok");
  }
}

$("pickFile").onclick = event => { event.preventDefault(); $("fileInput").click(); };
$("fileInput").onchange = event => {
  if (event.target.files[0]) importFile(event.target.files[0]);
  event.target.value = "";     // let the same file be picked again
};

// A counter, because dragging over child elements fires leave/enter constantly.
let dragDepth = 0;
window.addEventListener("dragenter", event => {
  if (![...event.dataTransfer.types].includes("Files")) return;
  event.preventDefault();
  if (++dragDepth === 1) {
    $("dropLabel").textContent = ($("tab-projects").classList.contains("on")
                                  && openProject && openProject.level === "folder")
      ? `Drop to add parts to "${openProject.name}"`
      : "Drop to load the text";
    $("dropZone").classList.add("on");
  }
});
window.addEventListener("dragover", event => {
  if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
});
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) { dragDepth = 0; $("dropZone").classList.remove("on"); }
});
window.addEventListener("drop", event => {
  if (![...event.dataTransfer.types].includes("Files")) return;
  event.preventDefault();
  dragDepth = 0;
  $("dropZone").classList.remove("on");
  const file = event.dataTransfer.files[0];
  if (file) importFile(file);
});

/* ── generate ─────────────────────────────────────────────────────────── */
$("playNow").onclick = () => {
  const text = $("text").value.trim();
  if (!text) return setStatus("status", "Type something to say first.", "err");
  if ($("engine").value === "omni") return setStatus("status",
    "Omni uses the complete Generate flow so its output can be checked. " +
    "Live preview is available with Qwen Audio TTS.", "err");

  // A streaming response can't return JSON errors once audio has started, so
  // problems surface as the player failing rather than as a message.
  const params = new URLSearchParams({
    text, voice: $("voice").value, engine: $("engine").value,
    instruction: $("instruction").value,
    language: $("language").value === "Auto" ? "" : $("language").value,
    rate: $("rate").value, pitch: $("pitch").value, volume: $("volume").value,
    confirmed: "1",
  });
  setStatus("status", "Starting…", "busy");
  player.load({
    url: `/api/stream?${params}`, name: "live-stream",
    title: text, meta: `${voiceLabel($("voice").value)} · live stream`,
    voice: $("voice").value, downloadable: false, waveform: false,
  }, { autoplay: false });
  player.audio.play().then(() => {
    setStatus("status", "Playing as it's made — not saved to a file.", "ok");
  }).catch(err => setStatus("status", `Couldn't start: ${err.message}`, "err"));
};

$("go").onclick = async () => {
  const btn = $("go");
  btn.disabled = true;
  btn.textContent = "Generating…";
  setStatus("status", "Talking to the model…", "busy");
  watchProgress("status");
  try {
    if (composer.editing && composer.editing.kind === "draft")
      return recordDraft(composer.editing);
    if (composer.editing) return finishTake();
    const data = await spendGuarded("/api/speak", {
      text: $("text").value,
      voice: $("voice").value,
      engine: $("engine").value,
      model: $("model").value,
      format: $("format").value,
      language: $("language").value,
      instruction: $("engine").value === "omni" ? $("omniDirection").value : $("instruction").value,
      speech_mode: $("engine").value === "omni" ? $("speechMode").value : "exact",
      rate: parseFloat($("rate").value),
      pitch: parseFloat($("pitch").value),
      volume: parseInt($("volume").value, 10),
      seed: parseInt($("seed").value, 10) || 0,
      project_id: composer.target ? composer.target.id : null,
      insert_at: composer.at,
    }, "This take");
    if (data === null) {
      setStatus("status", "Cancelled — nothing was charged.", "");
    } else if (data.error) {
      setStatus("status", data.error, "err");
    } else {
      const failed = data.failures || [];
      if (failed.length) {
        // Never let missing sentences pass as a clean render.
        setStatus("status",
          `⚠ ${failed.length} of ${data.requests} parts failed and are MISSING from ` +
          `the audio (part ${failed.map(f => f.index).join(", ")}). ` +
          `Generate again to retry. Charged $${data.cost} for what rendered.`, "err");
      } else {
        const swaps = [
          ...(data.pronunciations || []).map(p => `${p.pattern}→${p.replacement}`),
          ...(data.rewrites || []).map(r => `${r.from}→${r.to}`),
        ].join(", ");
        const where = openProject ? ` · added to "${openProject.name}"` : "";
        setStatus("status",
          `Generated — ${data.size_mb} MB · $${data.cost} ${data.cost_basis || "estimate"}${where}` +
          (swaps ? ` · spoken as: ${swaps}` : "") +
          (data.warning ? ` · ⚠ ${data.warning}` : "") +
          (data.returned_text ? " · transcript captured" : ""),
          data.warning ? "err" : "ok");
        if (composer.target) {
          // Stay open, aimed at the end — write, generate, write, generate.
          composer.at = null;
          const stayIn = composer.target.id;
          composer.target = null;          // showProject would otherwise send it home
          await showProject(stayIn);
          $("text").value = "";
          updateCount();
          composer.open({ project: openProject, at: null,
                          title: `New part ${nextPartNumber(openProject)}` });
        }
      }
      play(data.url, data.name, `${data.chars} chars · ${data.requests} request(s)`, data.path);
      refreshHistory();
      activityController.loadSpend();
    }
  } catch (err) {
    setStatus("status", String(err), "err");
  } finally {
    stopWatchingProgress();
    btn.disabled = false;
    composer.describe();
  }
};

/* ── wiring ───────────────────────────────────────────────────────────── */
function routeComposerText() {
  const hasArabic = /[\u0600-\u06ff]/.test($("text").value);
  if (!hasArabic) return;
  if ([...$("language").options].some(o => o.value === "Arabic"))
    $("language").value = "Arabic";
  if ($("engine").value === "omni") { updateComposerRoute(); return; }
  $("engine").value = "omni";
  syncEngineUI();
  setStatus("status", "Arabic detected — switched to Qwen 3.5 Omni with Tina.", "");
}

$("text").addEventListener("input", () => {
  routeComposerText(); updateCount(); multilingualController.update();
});
let searchTimer;
$("historySearch").addEventListener("input", () => {
  clearTimeout(searchTimer);              // one query per pause, not per keystroke
  searchTimer = setTimeout(refreshHistory, 250);
});
// A cloned voice only runs on the tier it was made for, so choosing one has to
// move the Quality setting with it rather than failing at generate time.
$("voice").addEventListener("change", () => {
  const chosen = $("voice").value;
  const clone = clonedVoices.find(v => (v.voice_id || v.voice || v) === chosen);
  if (!clone) return;
  const theirEngine = clone.engine || "audio";
  const theirTier = String(clone.target_model || clone.targetModel || chosen)
    .includes("flash") ? "flash" : "plus";
  const engineChanged = $("engine").value !== theirEngine;
  if (engineChanged) $("engine").value = theirEngine;
  if ($("model").value !== theirTier) {
    $("model").value = theirTier;
    fillVoiceSelect();
    $("voice").value = chosen;
    updateCount();
    setStatus("status",
      `Switched Quality to ${theirTier === "flash" ? "Flash" : "Plus"} — ` +
      `that's the tier this voice was cloned on.`, "");
  } else if (engineChanged) {
    syncEngineUI();
    $("voice").value = chosen;
  }
});

$("model").addEventListener("change", () => {
  updateCount();
  multilingualController.update();
  fillVoiceSelect();
  if (library.length) {
    $("voiceTotal").textContent = library.filter(v => v.tier === $("model").value).length;
  }
});
$("engine").addEventListener("change", syncEngineUI);
$("speechMode").addEventListener("change", syncSpeechMode);
$("omniDirection").addEventListener("input", updateComposerRoute);
$("language").addEventListener("change", () => {
  const language = $("language").value;
  const audioLanguages = config.capabilities?.audio?.system_languages || [];
  if (language !== "Auto" && !audioLanguages.includes(language) &&
      $("engine").value === "audio") {
    $("engine").value = "omni";
    syncEngineUI();
    setStatus("status", `Switched to Qwen 3.5 Omni because ${language} is not ` +
      "in Qwen Audio TTS's official system-voice language contract.", "");
  }
  updateComposerRoute();
  multilingualController.update();
});
$("instruction").addEventListener("input", updateInstr);
$("tagToggle").onclick = () => {
  const open = $("tagPanel").style.display === "none";
  $("tagPanel").style.display = open ? "" : "none";
  $("tagToggle").classList.toggle("on", open);
  refreshTags();
  if (open) $("tagPanel").scrollIntoView({ block: "nearest", behavior: "smooth" });
};
$("cloneLen").addEventListener("input", e => $("cloneLenVal").textContent = e.target.value + "s");
// Strip what the service will reject as you type, rather than failing later.
$("clonePrefix").addEventListener("input", e => {
  const omni = $("cloneEngine").value === "omni";
  const cleaned = e.target.value.toLowerCase()
    .replace(omni ? /[^a-z0-9_]/g : /[^a-z0-9]/g, "")
    .slice(0, omni ? 16 : 9);
  if (cleaned !== e.target.value) e.target.value = cleaned;
  cloneRecorder.updateSteps();
});
$("cloneEngine").addEventListener("change", syncCloneEngine);
$("cloneUrl").addEventListener("input", cloneRecorder.updateSteps);
[["rate","rateVal",v=>v+"×"],["pitch","pitchVal",v=>v+"×"],["volume","volVal",v=>v]]
  .forEach(([id,label,fmt]) =>
    $(id).addEventListener("input", e => $(label).textContent = fmt(e.target.value)));

/* ── keyboard shortcuts ───────────────────────────────────────────────── */
document.addEventListener("keydown", event => {
  const accel = event.metaKey || event.ctrlKey;
  if (accel && event.key === "Enter") {
    event.preventDefault();
    // Do whatever the visible tab's main button does.
    if ($("tab-speak").classList.contains("on")) $("go").click();
    return;
  }
  if (accel && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if ($("tab-speak").classList.contains("on")) $("voicePick").click();
    return;
  }
  // Plain digits would fight with typing, so tab switching takes the modifier.
  if (accel && "1234567".includes(event.key)) {
    event.preventDefault();
    const tabs = ["speak", "projects", "batch", "voices", "subtitles", "settings"];
    document.querySelector(`nav button[data-tab="${tabs[+event.key - 1]}"]`)?.click();
  }
});

async function load() {
  config = await api("/api/config");
  $("workspaceId").value = config.workspace?.id || "";
  $("newRegion").value = config.workspace?.region || "intl";
  // The naming form starts on what is saved. Loading it blank and then saving
  // wrote those blanks over the real settings.
  writeNaming("nm", config.naming, config.naming);

  for (const lang of config.languages) {
    $("language").add(new Option(lang, lang));
    $("subLang").add(new Option(lang, lang));
  }
  for (const f of config.formats) $("format").add(new Option(f.toUpperCase(), f));
  syncCloneEngine();
  syncEngineUI();
  // Opening on the voice you chose is the point of choosing one — and a cloned
  // voice can only be found once the clone list is loaded, which used to wait
  // until you opened the Voices tab.
  // Each is loaded on its own: one failing must not stop the other, and the
  // default has to be applied either way. A Promise.all here swallowed a
  // rejection and silently skipped the whole step.
  (async () => {
    try { await loadLibrary(); } catch (e) { console.error("voice catalogue:", e); }
    try { await loadCloned(); } catch (e) { console.error("cloned voices:", e); }
    // Names, pictures and notes are needed the moment anything shows a voice —
    // a part in a project, a take, the composer — not only in the Voices tab.
    try { await loadVoiceUsage(); } catch (e) { console.error("voice details:", e); }
    fillVoiceSelect();
    applyDefaultVoice();
    drawVoicePick();
  })();

  // Two groups, labelled by what they actually do — a mood that holds versus a
  // sound that fires once. Guessing which is which from the name is impossible.
  const TAG_NOTES = {
    Moods: "hold until the next mood tag",
    Sounds: "one effect, then back to normal",
  };
  for (const [group, tags] of Object.entries(config.tags)) {
    const wrap = document.createElement("div");
    wrap.className = "chip-group";
    wrap.innerHTML = `<div class="g">${group} <em>— ${TAG_NOTES[group] || ""}</em></div>`;
    const row = document.createElement("div");
    row.className = "chips";
    for (const [tag, meaning] of Object.entries(tags)) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = tag;
      chip.dataset.tag = tag;
      chip.title = meaning;
      chip.onclick = () => { insertAtCursor($("text"), `[${tag}] `); refreshTags(); };
      row.appendChild(chip);
    }
    wrap.appendChild(row);
    $("tags").appendChild(wrap);
  }
  refreshTags();

  for (const preset of (config.performance_presets || [])) {
    const { name, instruction } = preset;
    const b = document.createElement("button");
    b.className = "preset";
    b.innerHTML = `<b>${name}</b><span>${instruction}</span>`;
    b.onclick = () => { $("instruction").value = instruction; updateInstr(); };
    $("presets").appendChild(b);
  }

  const builtin = $("builtinList");
  for (const [tier, voices] of Object.entries(config.voices)) {
    const heading = document.createElement("div");
    heading.className = "g";
    heading.style.cssText = "font-size:11px;color:var(--muted);margin:8px 0 2px";
    heading.textContent = tier === "plus" ? "Plus tier" : "Flash tier";
    builtin.appendChild(heading);
    for (const [id, desc] of Object.entries(voices)) {
      const row = document.createElement("div");
      row.className = "item";
      const b = document.createElement("button");
      b.className = "name";
      b.textContent = `${id} — ${desc}`;
      b.onclick = () => {
        $("model").value = tier;   // picking a voice implies its tier
        fillVoiceSelect();
        $("voice").value = id;
        updateCount();
        document.querySelector('nav button[data-tab="speak"]').click();
      };
      row.appendChild(b);
      builtin.appendChild(row);
    }
  }

  $("outDir").value = config.out_dir;
  $("warnAbove").value = (config.prefs || {}).warn_above ?? 1;
  $("dailyCap").value = (config.prefs || {}).daily_cap ?? 0;
  const st = config.storage_settings || {};
  $("stEndpoint").value = st.endpoint || "";
  $("stBucket").value = st.bucket || "";
  $("stRegion").value = st.region || "us-east-1";
  settingsController.showStorageStatus(config.storage);

  $("batchMaxRows").textContent = (config.batch_max_rows || 2000).toLocaleString();
  $("ratePlus").textContent = config.capabilities?.audio?.rates_per_million_chars?.plus || 20;
  $("rateFlash").textContent = config.capabilities?.audio?.rates_per_million_chars?.flash || 15;
  $("extraParams").value = (config.prefs || {}).extra_params || "";
  $("fixDatesPhones").checked = (config.prefs || {}).fix_dates_phones !== false;
  $("dayFirst").value = (config.prefs || {}).day_first === false ? "0" : "1";
  settingsController.renderSynthFlags();
  $("instrMax").textContent = config.instruction_max;
  $("chunkSize").textContent = config.chunk_size;
  renderHistory(config.history);
  settingsController.markKey(config.has_key);

  // The database is optional — say so plainly rather than silently degrading.
  const database = config.database || {};
  $("dbState").textContent = database.connected
    ? `${database.count} saved`
    : "history db offline";
  $("historyCount").textContent = database.connected ? database.count : "";
  $("dbState").style.color = database.connected ? "var(--muted)" : "var(--warn)";
  $("historySearch").style.display = database.connected ? "" : "none";

  updateCount();
  await loadLibrary();
  await loadProjectTree();
  if (window.location.search) await applyLocationRoute();
  composer.describe();
  await multilingualController.build();
  multilingualController.update();
  if (!config.has_key) $("keyDialog").showModal();
  else loadCloned();
  // Browsers restore textarea values across reloads without firing `input`.
  // Route that restored Arabic text as deliberately as newly typed text.
  routeComposerText();
}

load();
