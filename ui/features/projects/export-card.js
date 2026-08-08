/* A stitched file is an output, never another source part. This component
   renders that distinction and exposes only output-appropriate actions. */
(function exposeProjectExportCard(global) {
  "use strict";

  function create({ icon, clock, escapeHtml }) {
    function render(item, { latest = false, outdated = false, sequenceDuration = 0,
                            onPlay, downloadUrl } = {}) {
      const card = document.createElement("article");
      card.className = `project-export-card${latest ? " latest" : ""}`;
      card.innerHTML =
        `<div class="project-export-icon">${icon("stack")}</div>` +
        `<div class="project-export-copy">` +
          `<span>${latest ? outdated ? "Out of date" : "Latest export" : "Earlier export"}</span>` +
          `<b dir="auto">${escapeHtml(item.title || "Finished audio")}</b>` +
          `<small>${clock((item.duration_ms || 0) / 1000)} · ` +
            `${escapeHtml(item.filename || "audio export")}</small>` +
          (latest && outdated
            ? `<small class="export-stale">Sequence is now ${clock(sequenceDuration)} — export again to update it.</small>`
            : "") +
        `</div><div class="project-export-actions"></div>`;

      const actions = card.querySelector(".project-export-actions");
      const play = document.createElement("button");
      play.className = "icon-btn";
      play.title = "Play this export";
      play.setAttribute("aria-label", play.title);
      play.innerHTML = icon("play");
      play.onclick = () => onPlay?.(item, play);
      actions.appendChild(play);

      const download = document.createElement("a");
      download.className = "ghost fit project-export-download";
      download.href = downloadUrl;
      download.download = item.filename || "";
      download.textContent = "Download";
      actions.appendChild(download);
      return card;
    }

    return Object.freeze({ render });
  }

  global.ProjectExportCard = Object.freeze({ create });
})(window);
