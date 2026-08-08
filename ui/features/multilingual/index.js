/* Optional translated speech versions, independent from the main Composer flow. */
(function exposeStudioMultilingual(global) {
  "use strict";

  function create({ get, api, setStatus, escapeHtml, rateFor, spendGuarded,
                    watchProgress, stopWatchingProgress, play, outDir,
                    refreshHistory, loadSpend }) {
    const $ = get;
    const chosen = new Set();

    function update() {
      const count = chosen.size;
      const chars = $("text").value.length;
      const cost = chars / 1e6 * rateFor($("model").value) * count * 1.3;
      $("langGo").disabled = count === 0 || chars === 0;
      $("langGo").textContent = !count ? "Pick a language first"
        : !chars ? "Type something first"
        : `Make ${count} version${count === 1 ? "" : "s"} · about $${cost.toFixed(4)}`;
    }

    async function build() {
      const box = $("langChips");
      if (box.children.length) return;
      const data = await api("/api/languages");
      const unreliable = data.unreliable || {};
      for (const name of data.speakable || []) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.textContent = unreliable[name] ? `${name} ⚠` : name;
        if (unreliable[name]) chip.title = unreliable[name];
        chip.onclick = () => {
          if (chosen.has(name)) {
            chosen.delete(name);
            chip.style.background = chip.style.borderColor = chip.style.color = "";
          } else {
            chosen.add(name);
            chip.style.background = chip.style.borderColor = "var(--accent)";
            chip.style.color = "#fff";
          }
          update();
        };
        box.appendChild(chip);
      }
    }

    $("langClear").onclick = () => {
      chosen.clear();
      $("langChips").querySelectorAll(".chip").forEach(chip =>
        chip.style.background = chip.style.borderColor = chip.style.color = "");
      update();
    };
    $("langGo").onclick = async () => {
      const languages = [...chosen];
      $("langGo").disabled = true;
      $("langProgress").style.display = "";
      $("langProgressText").textContent = `Translating and speaking ${languages.length}…`;
      setStatus("langStatus", "");
      $("langResults").innerHTML = "";
      watchProgress("langStatus");
      const response = await spendGuarded("/api/speak/languages", {
        text: $("text").value, languages, quality: $("langQuality").value,
        voice: $("voice").value, model: $("model").value, format: $("format").value,
        instruction: $("instruction").value, rate: parseFloat($("rate").value),
        pitch: parseFloat($("pitch").value), volume: parseInt($("volume").value, 10),
        seed: parseInt($("seed").value, 10) || 0,
      }, `${languages.length} language version${languages.length === 1 ? "" : "s"}`);
      stopWatchingProgress();
      $("langProgress").style.display = "none";
      $("langGo").disabled = false;
      update();
      if (response === null) return setStatus("langStatus", "Cancelled — nothing was charged.", "");
      if (response.error) return setStatus("langStatus", response.error, "err");
      const done = (response.results || []).filter(item => !item.error);
      const failed = (response.results || []).filter(item => item.error);
      for (const item of response.results || []) {
        const row = document.createElement("div");
        row.className = "item";
        if (item.error) {
          row.innerHTML = `<span class="hint" style="margin:0"><b>${item.language}</b> — ` +
            `<span style="color:var(--bad)">${escapeHtml(item.error)}</span></span>`;
        } else {
          const listen = document.createElement("button");
          listen.className = "name";
          listen.innerHTML = `<span style="color:var(--text)"><b>${item.language}</b> — ` +
            `${escapeHtml(item.text.slice(0, 70))}${item.text.length > 70 ? "…" : ""}</span><br>` +
            `<span style="font-size:11px">${item.size_mb} MB · $${item.cost}</span>`;
          listen.onclick = () => play(item.url, item.name,
            `${item.language} · ${item.size_mb} MB`, `${outDir()}/${item.name}`);
          const save = document.createElement("button");
          save.className = "x";
          save.textContent = "↓";
          save.title = "Download";
          save.onclick = () => {
            const link = document.createElement("a");
            link.href = item.url;
            link.download = item.name;
            link.click();
          };
          row.append(listen, save);
        }
        $("langResults").appendChild(row);
      }
      setStatus("langStatus", `${done.length} made` +
        `${failed.length ? `, ${failed.length} failed` : ""} — about $${response.cost} total. ` +
        `They're in your history too.`, failed.length ? "err" : "ok");
      refreshHistory();
      loadSpend();
    };
    return Object.freeze({ build, update });
  }

  global.StudioMultilingual = Object.freeze({ create });
})(window);
