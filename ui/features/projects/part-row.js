/* Typed Projects part row. It renders audio, draft, silence and linked-asset
   variants, but knows nothing about APIs, dialogs, Composer or project state. */
(function exposeProjectPartRow(global) {
  "use strict";

  function create({ voiceAvatar, voiceLabel, voiceDetail, icon, clock, escapeHtml,
                    partSeconds }) {
    const actionButton = action => {
      const button = document.createElement("button");
      button.className = `icon-btn${action.danger ? " danger" : ""}`;
      button.innerHTML = icon(action.icon);
      button.title = action.title;
      button.disabled = !!action.disabled;
      button.onclick = event => {
        event.stopPropagation();
        if (!button.disabled) action.run?.(button, event);
      };
      return button;
    };

    function render(part, options = {}) {
      const {
        label = "•", extraClass = "", library = false, selectable = true,
        selected = false, takesOpen = false,
        primaryActions = [], menuActions = [],
        onOpen, onTakes, onSubtitles, onTranslate, onSelect,
        onDurationChange,
        draggable = false, canDragOver, onDragStart, onDragEnd, onDrop,
      } = options;
      const silent = part.kind === "silence";
      const draft = part.kind === "draft";
      const asset = part.kind === "asset";
      const seconds = partSeconds(part);
      const cost = Number(part.cost || 0);
      const spent = Number(part.spent ?? cost);
      const languages = part.languages || [];
      const row = document.createElement("div");
      row.className = `part ${extraClass}`;
      row.dataset.partId = part.id;

      row.innerHTML =
        (selectable ? `<label class="part-pick" title="Select this part">` +
          `<input type="checkbox" ${selected ? "checked" : ""}></label>` :
          `<span class="part-pick" aria-hidden="true"></span>`) +
        `<div class="part-num" title="${library ? "Library file" : "Drag to move this part"}">${label}</div>` +
        `<div class="part-body">` +
          `<div class="part-heading">` +
          (silent ? `<span class="part-kind">Silence</span>` :
            library ? `<div class="part-who">${icon("stack")}` +
              `<span class="nm">Uploaded file</span></div>` :
              `<div class="part-who">${voiceAvatar(part.voice, 26)}` +
              `<span class="nm">${escapeHtml(voiceLabel(part.voice))}</span>` +
              (voiceDetail(part.voice)
                ? `<span class="dt">${escapeHtml(voiceDetail(part.voice))}</span>` : "") +
              `</div>`) +
          (draft ? `<span class="part-duration pending">Not recorded</span>`
            : silent && onDurationChange
              ? `<label class="part-duration-edit" title="Length of this silence">` +
                `<input class="part-duration-input" type="number" min="0.1" max="120" ` +
                `step="0.5" value="${seconds}"><span>sec</span></label>`
              : `<span class="part-duration">${clock(seconds)}</span>`) +
          `</div>` +
          `<div class="part-text" dir="auto">${silent
            ? `A quiet gap between parts`
            : escapeHtml(part.text || part.filename || "")}</div>` +
          `<div class="part-meta">` +
            (library ? `<span class="pill asset-chip">venture asset · uploaded</span>`
            : asset ? (part.missing
              ? `<span class="pill gone">the asset was deleted</span>`
              : `<span class="pill asset-chip">linked asset · free</span>`)
            : draft
              ? `<span class="pill draft-chip">draft · not recorded</span>` +
                `<span>${(part.text || "").length} characters</span>`
            : silent ? `<span class="pill">silence · free</span>`
            : `<span title="${spent > cost + 1e-9
                ? `This take cost $${cost.toFixed(4)}; every take of this part adds up to $${spent.toFixed(4)}`
                : "What this part cost"}">$${spent.toFixed(4)}</span>` +
              `<button class="pill takes-chip${takesOpen ? " done" : ""}" ` +
                `title="Show every take of this part">${(part.takes || 0) + 1} ` +
                `take${part.takes ? "s" : ""} ${takesOpen ? "▴" : "▾"}</button>` +
              `<button class="pill cc-chip${part.subtitles_stale ? " stale"
                : part.subtitled ? " done" : ""}" title="${part.subtitles_stale
                  ? "The audio changed after these were made — they describe the old take"
                  : part.subtitled ? "Subtitles ready — open them"
                  : "No subtitles yet — make them"}">${icon("cc")}` +
                `${part.subtitles_stale ? "subtitles out of date"
                  : part.subtitled ? "subtitles" : "add subtitles"}</button>` +
              `<button class="pill lang-chip${languages.length ? " done" : ""}" ` +
                `title="${languages.length
                  ? "Translated subtitles — open or add another language"
                  : "Translate these subtitles into another language"}">${icon("globe")}` +
                `${languages.length ? escapeHtml(languages.join(", ")) : "translate"}</button>`) +
          `</div>` +
        `</div><div class="part-tools"></div>`;

      const tools = row.querySelector(".part-tools");
      primaryActions.forEach(action => tools.appendChild(actionButton(action)));

      if (menuActions.length) {
        const more = actionButton({ icon: "more", title: library
          ? "More for this file" : "More for this part" });
        more.onclick = event => {
          event.stopPropagation();
          document.querySelectorAll(".row-menu").forEach(menu => menu.remove());
          if (more.dataset.open === "1") {
            delete more.dataset.open;
            return;
          }
          more.dataset.open = "1";
          const menu = document.createElement("div");
          menu.className = "row-menu";
          menuActions.forEach(action => {
            const item = document.createElement("button");
            item.innerHTML = `${icon(action.icon)}<span>${escapeHtml(action.title)}</span>`;
            item.disabled = !!action.disabled;
            if (action.danger) item.className = "danger";
            item.onclick = () => {
              menu.remove();
              delete more.dataset.open;
              action.run?.();
            };
            menu.appendChild(item);
          });
          tools.appendChild(menu);
        };
        tools.appendChild(more);
      }

      const body = row.querySelector(".part-body");
      if (!silent && onOpen) {
        body.style.cursor = "pointer";
        body.onclick = () => onOpen(part);
      }
      const stopAnd = callback => event => {
        event.stopPropagation();
        callback?.(part);
      };
      row.querySelector(".takes-chip")?.addEventListener("click", stopAnd(onTakes));
      row.querySelector(".cc-chip")?.addEventListener("click", stopAnd(onSubtitles));
      row.querySelector(".lang-chip")?.addEventListener("click", stopAnd(onTranslate));

      const durationInput = row.querySelector(".part-duration-input");
      if (durationInput) {
        durationInput.onclick = event => event.stopPropagation();
        durationInput.onkeydown = event => {
          if (event.key === "Enter") durationInput.blur();
          if (event.key === "Escape") {
            durationInput.value = String(seconds);
            durationInput.blur();
          }
        };
        durationInput.onchange = async event => {
          event.stopPropagation();
          const value = Math.max(.1, Math.min(120, Number(durationInput.value) || seconds));
          durationInput.value = String(value);
          durationInput.disabled = true;
          try { await onDurationChange?.(part, value); }
          finally { durationInput.disabled = false; }
        };
      }

      const pick = row.querySelector(".part-pick input");
      if (pick) pick.onclick = event => {
          event.stopPropagation();
          onSelect?.({ part, event, checked: pick.checked, row });
        };
      row.classList.toggle("picked", selected);

      if (draggable) {
        row.draggable = true;
        row.addEventListener("dragstart", event => {
          row.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(part.id));
          onDragStart?.(part, row);
        });
        row.addEventListener("dragend", () => {
          row.classList.remove("dragging");
          onDragEnd?.(part, row);
        });
        row.addEventListener("dragover", event => {
          if (canDragOver && !canDragOver(part)) return;
          event.preventDefault();
          const middle = row.getBoundingClientRect().top + row.offsetHeight / 2;
          row.classList.toggle("drop-above", event.clientY < middle);
          row.classList.toggle("drop-below", event.clientY >= middle);
        });
        row.addEventListener("dragleave", () =>
          row.classList.remove("drop-above", "drop-below"));
        row.addEventListener("drop", event => {
          event.preventDefault();
          const after = row.classList.contains("drop-below");
          row.classList.remove("drop-above", "drop-below");
          onDrop?.({ part, after, row });
        });
      }
      return row;
    }

    return Object.freeze({ render });
  }

  global.ProjectPartRow = Object.freeze({ create });
})(window);
