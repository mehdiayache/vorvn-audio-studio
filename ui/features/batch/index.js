/* Batch owns spreadsheet preview, column mapping and batch-run results. */
(function exposeStudioBatch(global) {
  "use strict";

  function create({ get, setStatus, escapeHtml, spendGuarded, watchProgress,
                    stopWatchingProgress, play, loadSpend, fileDrop }) {
    let sheet = null;

    function fillColumnPicker(select, headers, chosen, optional) {
      select.innerHTML = "";
      if (optional) select.add(new Option("Use the same for every row", ""));
      headers.forEach((header, index) => select.add(new Option(header, String(index))));
      select.value = chosen === null || chosen === undefined ? "" : String(chosen);
    }

    function renderPreview() {
      if (!sheet) return;
      const textCol = parseInt(get("batchColText").value, 10);
      const nameCol = get("batchColName").value === "" ? null
        : parseInt(get("batchColName").value, 10);
      const rows = sheet.preview;
      const table = ["<table style='border-collapse:collapse;font-size:12.5px;width:100%'>",
        "<tr><th style='text-align:left;padding:4px 8px;color:var(--muted);font-weight:600'>File</th>" +
        "<th style='text-align:left;padding:4px 8px;color:var(--muted);font-weight:600'>Will say</th></tr>"];
      rows.forEach((row, index) => {
        const words = (row[textCol] || "").trim();
        const label = nameCol === null ? `row-${index + 2}`
          : (row[nameCol] || `row-${index + 2}`).trim();
        const safe = (label.replace(/[^A-Za-z0-9._-]+/g, "-")
          .replace(/^-+|[-.]+$/g, "") || `row-${index + 2}`).slice(0, 60);
        table.push(`<tr><td style="padding:4px 8px;white-space:nowrap;color:var(--muted)">` +
          `${escapeHtml(safe)}.mp3</td><td style="padding:4px 8px">` +
          `${words ? escapeHtml(words.slice(0, 80)) :
            '<span style="color:var(--bad)">empty — skipped</span>'}</td></tr>`);
      });
      table.push("</table>");
      const usable = rows.filter(row => (row[textCol] || "").trim()).length;
      get("batchPreview").innerHTML = table.join("") +
        `<p class="hint">Showing the first ${rows.length} of ${sheet.rows} rows.` +
        (usable < rows.length ? " Empty rows are skipped." : "") + "</p>";
      get("batchGo").textContent = `Speak ${sheet.rows} row${sheet.rows === 1 ? "" : "s"}`;
    }

    async function previewFile(file) {
      if (!file) return;
      setStatus("batchStatus", `Reading ${file.name}…`, "busy");
      const response = await fetch("/api/batch/preview", {
        method: "POST", headers: { "X-Filename": encodeURIComponent(file.name) }, body: file,
      }).then(result => result.json());
      if (response.error) {
        get("batchStep2").style.display = get("batchStep3").style.display = "none";
        return setStatus("batchStatus", response.error, "err");
      }
      sheet = response;
      get("batchMaxRows").textContent = response.max_rows.toLocaleString();
      fillColumnPicker(get("batchColText"), response.headers, response.guess.text, false);
      fillColumnPicker(get("batchColName"), response.headers, response.guess.name, true);
      fillColumnPicker(get("batchColVoice"), response.headers, response.guess.voice, true);
      const bad = (response.voices || {}).unknown || [];
      if (bad.length) {
        setStatus("batchStatus", `${bad.length} voice${bad.length === 1 ? "" : "s"} in this sheet ` +
          `${bad.length === 1 ? "doesn't" : "don't"} exist: ` +
          bad.slice(0, 4).map(item => `"${item.voice}" (row ${item.first_row})`).join(", ") +
          `${bad.length > 4 ? `, and ${bad.length - 4} more` : ""}. ` +
          `Those rows would fail — fix the sheet, or pick a different column.`, "err");
      } else if ((response.voices || {}).checked) {
        setStatus("batchStatus", `All ${response.voices.checked} voice` +
          `${response.voices.checked === 1 ? "" : "s"} in this sheet exist.`, "ok");
      }
      fillColumnPicker(get("batchColLang"), response.headers, response.guess.language, true);
      get("batchStep1").classList.remove("active");
      get("batchStep2").style.display = get("batchStep3").style.display = "";
      get("batchStep2").classList.add("active");
      renderPreview();
      setStatus("batchStatus", `${response.rows} rows found` +
        (response.truncated ? ` — only the first ${response.max_rows} will be used.` : "."), "ok");
    }

    async function run() {
      if (!sheet) return;
      get("batchGo").disabled = true;
      get("batchProgress").style.display = "";
      get("batchProgressText").textContent = `Speaking ${sheet.rows} rows…`;
      setStatus("batchStatus", "");
      watchProgress("batchStatus");
      const response = await spendGuarded("/api/batch/run", {
        token: sheet.token,
        columns: {
          text: parseInt(get("batchColText").value, 10),
          name: get("batchColName").value === "" ? null : parseInt(get("batchColName").value, 10),
          voice: get("batchColVoice").value === "" ? null : parseInt(get("batchColVoice").value, 10),
          language: get("batchColLang").value === "" ? null : parseInt(get("batchColLang").value, 10),
        },
        voice: get("voice").value, model: get("model").value, format: get("format").value,
        instruction: get("instruction").value,
        language: get("language").value === "Auto" ? "" : get("language").value,
        rate: parseFloat(get("rate").value), pitch: parseFloat(get("pitch").value),
        volume: parseInt(get("volume").value, 10),
      }, `${sheet.rows} rows`);
      stopWatchingProgress();
      get("batchProgress").style.display = "none";
      get("batchGo").disabled = false;
      if (response === null)
        return setStatus("batchStatus", "Cancelled — nothing was charged.", "");
      if (response.error) return setStatus("batchStatus", response.error, "err");
      get("batchResultCard").style.display = "";
      get("batchSummary").textContent = `${response.made} made` +
        `${response.failed ? ` · ${response.failed} failed` : ""} · $${response.cost}`;
      get("batchZip").style.display = response.zip ? "inline-block" : "none";
      if (response.zip) get("batchZip").href = response.zip;
      const box = get("batchResults");
      box.innerHTML = "";
      for (const item of response.results) {
        const row = document.createElement("div");
        row.className = "item";
        if (item.error) {
          row.innerHTML = `<span class="hint" style="margin:0">Row ${item.row} — ` +
            `<span style="color:var(--bad)">${escapeHtml(item.error)}</span></span>`;
        } else {
          const button = document.createElement("button");
          button.className = "name";
          button.innerHTML = `<span style="color:var(--text)">${escapeHtml(item.name)}</span><br>` +
            `<span style="font-size:11px">${escapeHtml(item.text)}</span>`;
          button.onclick = () => play(item.url, item.name, `row ${item.row}`, "");
          row.appendChild(button);
        }
        box.appendChild(row);
      }
      setStatus("batchStatus", `Done — ${response.made} file` +
        `${response.made === 1 ? "" : "s"}, about $${response.cost}.`,
        response.failed ? "err" : "ok");
      loadSpend();
    }

    function showSettings() {
      const selectedVoice = get("voice").selectedOptions[0]?.textContent || get("voice").value;
      get("batchSettings").innerHTML = [
        ["Voice", selectedVoice], ["Quality", get("model").value === "plus" ? "Plus" : "Flash"],
        ["Language", get("language").value], ["Direction", get("instruction").value || "none"],
        ["Speed / pitch", `${get("rate").value}× / ${get("pitch").value}×`],
      ].map(([key, value]) => `<div class="item"><span class="hint" style="margin:0">` +
        `<b>${key}</b> — ${escapeHtml(String(value))}</span></div>`).join("");
    }

    get("batchFile").onchange = event => previewFile(event.target.files[0]);
    fileDrop.bind({ target: get("batchFileDrop"), input: get("batchFile"),
                    onFiles: files => previewFile(files[0]) });
    ["batchColText", "batchColName", "batchColVoice", "batchColLang"].forEach(id =>
      get(id).addEventListener("change", () => {
        get("batchStep2").classList.remove("active");
        get("batchStep3").classList.add("active");
        renderPreview();
      }));
    get("batchGo").onclick = run;
    return Object.freeze({ previewFile, showSettings });
  }

  global.StudioBatch = Object.freeze({ create });
})(window);
