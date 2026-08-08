/* Reusable Projects primitives: URL state and the compact production timeline.
   No API calls and no global app state live here, so both pieces can be tested
   or reused without loading the Composer. */
(function () {
  "use strict";

  const VALID_TABS = new Set([
    "speak", "projects", "batch", "voices", "activity", "subtitles", "settings",
  ]);

  function readRoute(locationLike = window.location) {
    const params = new URLSearchParams(locationLike.search || "");
    const tab = VALID_TABS.has(params.get("tab")) ? params.get("tab") : "speak";
    const rawProject = Number(params.get("project"));
    return {
      tab,
      projectId: tab === "projects" && Number.isInteger(rawProject) && rawProject > 0
        ? rawProject : null,
    };
  }

  function href({ tab = "projects", projectId = null } = {}) {
    const params = new URLSearchParams();
    if (tab !== "speak") params.set("tab", tab);
    if (tab === "projects" && projectId) params.set("project", String(projectId));
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}`;
  }

  function writeRoute(route, mode = "push") {
    if (mode === "none") return;
    const url = href(route);
    const current = `${window.location.pathname}${window.location.search}`;
    if (mode === "replace" || current === url) history.replaceState(route, "", url);
    else history.pushState(route, "", url);
  }

  /* One indexed hierarchy model feeds the rail, cards, breadcrumbs and
     pickers. Views may differ; containment, paths and capabilities may not. */
  function hierarchy(items = []) {
    const list = [...items];
    const byId = new Map(list.map(item => [Number(item.id), item]));
    const children = new Map();
    for (const item of list) {
      const parent = item.parent_id == null ? null : Number(item.parent_id);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    }

    const childrenOf = itemOrId =>
      children.get(itemOrId == null ? null : Number(itemOrId.id ?? itemOrId)) || [];
    const ancestorsOf = itemOrId => {
      const item = typeof itemOrId === "object" ? itemOrId : byId.get(Number(itemOrId));
      const ancestors = [];
      let parent = item?.parent_id == null ? null : byId.get(Number(item.parent_id));
      while (parent) {
        ancestors.unshift(parent);
        parent = parent.parent_id == null ? null : byId.get(Number(parent.parent_id));
      }
      return ancestors;
    };
    const pathOf = itemOrId => {
      const item = typeof itemOrId === "object" ? itemOrId : byId.get(Number(itemOrId));
      return item ? [...ancestorsOf(item), item].map(step => step.name).join(" › ") : "";
    };
    const descendantsOf = itemOrId => {
      const output = [];
      const visit = id => childrenOf(id).forEach(child => {
        output.push(child);
        visit(child.id);
      });
      visit(typeof itemOrId === "object" ? itemOrId.id : itemOrId);
      return output;
    };
    const search = query => {
      const needle = String(query || "").trim().toLocaleLowerCase();
      if (!needle) return list;
      return list.filter(item => `${item.name || ""} ${item.description || ""}`
        .toLocaleLowerCase().includes(needle));
    };
    const contextFor = detail => {
      const item = byId.get(Number(detail?.id)) || detail || null;
      const lineage = item ? [...ancestorsOf(item), item] : [];
      const unsorted = item?.container_type === "inbox";
      const venture = lineage.find(step => step.container_type === "venture") || null;
      const project = lineage.find(step => step.container_type === "project") || null;
      const folder = lineage.find(step => step.container_type === "production") || null;
      return Object.freeze({
        venture,
        project,
        folder,
        current: detail || item,
        canCreateChild: ["venture", "project"].includes(item?.container_type),
        canContainParts: ["production", "inbox"].includes(item?.container_type),
        isUnsorted: unsorted,
        isLibrary: lineage.some(step => ["library", "asset_collection"]
          .includes(step.container_type)),
      });
    };

    return Object.freeze({ list, byId, childrenOf, ancestorsOf, descendantsOf,
                           pathOf, search, contextFor });
  }

  function timelineMarkup({ parts, music, partSeconds, clock, voiceLabel, escapeHtml }) {
    const sequence = parts.filter(part => part.kind !== "stitch");
    const total = sequence.reduce((sum, part) => sum + partSeconds(part), 0);
    if (!sequence.length || !total) return "";

    const kindOf = part => part.kind === "silence" ? "quiet"
      : part.kind === "asset" ? "asset"
      : part.kind === "draft" ? "draft" : "voice";
    const ticks = [0, .25, .5, .75, 1];
    const musicSeconds = Number(music.duration_ms || 0) / 1000;
    const musicFit = !music.filename ? ""
      : musicSeconds > total + .5
        ? `Trimmed from ${clock(musicSeconds)} to ${clock(total)}`
        : musicSeconds < total - .5
          ? `Looped from ${clock(musicSeconds)} to fill ${clock(total)}`
          : `Fits the ${clock(total)} production`;

    const clips = sequence.map((part, index) => {
      const seconds = partSeconds(part);
      const share = Math.max(1, seconds / total * 100);
      const kind = kindOf(part);
      const title = part.kind === "silence" ? `${seconds}s quiet`
        : part.kind === "asset" ? (part.text || "Linked asset")
        : part.kind === "draft" ? "Unrecorded draft" : voiceLabel(part.voice);
      return `<button class="timeline-clip ${kind}" style="width:${share}%" ` +
        `data-jump="${part.id}" title="Part ${index + 1} · ${escapeHtml(title)} · ${clock(seconds)}">` +
        `<b>${part.kind === "silence" ? `${seconds}s` : index + 1}</b>` +
        `<span>${escapeHtml(title)}</span><small>${clock(seconds)}</small></button>`;
    }).join("");

    const volume = Math.round(Number(music.volume ?? .10) * 100);
    const start = Math.max(0, Number(music.start || 0));
    const musicLane = music.filename
      ? `<div class="timeline-music-clip">` +
        `<div class="timeline-music-copy"><b>${escapeHtml(music.name || "Music bed")}</b>` +
        `<span>${musicFit}</span><small>${music.duck === false
          ? "Full level under speech" : "Automatically lowers under speech"}</small></div>` +
        `<div class="timeline-music-controls">` +
        `<button data-timeline-action="music-play" title="Play the source track">▶</button>` +
        `<label><span>Volume <output data-music-volume-output>${volume}%</output></span>` +
        `<input type="range" min="0" max="40" step="1" value="${volume}" ` +
        `data-timeline-action="music-volume"></label>` +
        `<label><span>Start <output data-music-start-output>${clock(start)}</output></span>` +
        `<input type="range" min="0" max="${Math.max(0, musicSeconds - .5)}" step="0.5" ` +
        `value="${Math.min(start, musicSeconds)}" data-timeline-action="music-start"></label>` +
        `<button data-timeline-action="music-details">Fades &amp; ducking</button>` +
        `</div></div>`
      : `<button class="timeline-empty-track" data-timeline-action="pick-music">` +
        `<b>+ Add background music</b><span>Choose from this Venture’s library</span></button>`;

    return `<section class="production-timeline" aria-label="Production timeline">` +
      `<header><div><b>Timeline</b><span>${sequence.length} parts · ${clock(total)}</span></div>` +
      `<div class="timeline-zoom"><button data-timeline-action="zoom-out" ` +
      `title="Zoom out">−</button><span>Zoom</span><button data-timeline-action="zoom-in" ` +
      `title="Zoom in">+</button></div></header>` +
      `<div class="timeline-scroll"><div class="timeline-stage">` +
      `<div class="timeline-ruler"><span class="timeline-lane-label">Time</span>` +
      `<div class="timeline-ruler-track">${ticks.map(tick =>
        `<span style="left:${tick * 100}%">${clock(total * tick)}</span>`).join("")}</div></div>` +
      `<div class="timeline-lane"><span class="timeline-lane-label"><b>Narration</b>` +
      `<small>Parts &amp; gaps</small></span><div class="timeline-track">${clips}</div></div>` +
      `<div class="timeline-lane"><span class="timeline-lane-label"><b>Music</b>` +
      `<small>${music.filename ? "Play · level · position" : "Optional"}</small></span>` +
      `<div class="timeline-track music-track">${musicLane}</div></div>` +
      `</div></div></section>`;
  }

  window.ProjectCore = Object.freeze({
    readRoute, href, writeRoute, hierarchy, timelineMarkup,
  });
})();
