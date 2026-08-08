/* Settings owns local administration: disk, limits, pronunciation and credentials. */
(function exposeStudioSettings(global) {
  "use strict";

  function create({ get, api, setStatus, escapeHtml, config, loadCloned }) {
    const $ = get;
    const asMB = bytes => `${(bytes / 1e6).toFixed(bytes < 1e6 ? 2 : 1)} MB`;
    let pronunciationTimer = null;
    let pronunciationRequest = 0;

    async function loadDisk() {
      const data = await api("/api/disk");
      if (data.error) return setStatus("diskStatus", data.error, "err");
      const rows = [`<div class="item"><span class="hint" style="margin:0">` +
        `<b style="color:var(--text)">Your finished audio</b> — ${asMB(data.finished.bytes)} ` +
        `across ${data.finished.files} files · <span style="color:var(--good)">kept forever</span>` +
        `</span></div>`];
      for (const info of Object.values(data.scratch)) {
        if (!info.files) continue;
        rows.push(`<div class="item"><span class="hint" style="margin:0">` +
          `${escapeHtml(info.what)} — ${asMB(info.bytes)}, ${info.files} file` +
          `${info.files === 1 ? "" : "s"}</span></div>`);
      }
      if (Object.values(data.scratch).every(item => !item.files))
        rows.push('<div class="item"><span class="hint" style="margin:0">' +
          'No working files to clear.</span></div>');
      $("diskUsage").innerHTML = rows.join("");
      $("diskTidy").disabled = data.scratch_total === 0;
      $("diskTidy").textContent = data.scratch_total
        ? `Tidy ${asMB(data.scratch_total)} of working files` : "Nothing to tidy";
    }

    function renderSynthFlags() {
      const saved = (config.prefs || {}).synth_flags || {};
      const box = $("synthFlags");
      box.innerHTML = "";
      for (const [flag, description] of Object.entries(config.synth_flags || {})) {
        const row = document.createElement("label");
        row.className = "field";
        row.style.marginBottom = "10px";
        row.innerHTML = `<span style="text-transform:none;font-size:13px;color:var(--text)">` +
          `<input type="checkbox" data-flag="${flag}" ${saved[flag] ? "checked" : ""}` +
          ` style="width:auto;margin-right:8px;accent-color:var(--accent)">` +
          `<code>${flag}</code></span><span style="font-size:12px">${description}</span>`;
        box.appendChild(row);
      }
    }

    async function loadPronunciations() {
      const data = await api("/api/pronunciations");
      const box = $("pronList");
      box.innerHTML = "";
      const rules = data.rules || [];
      if (!rules.length) {
        box.innerHTML = '<span class="hint">Nothing yet.</span>';
        return;
      }
      for (const rule of rules) {
        const row = document.createElement("div");
        row.className = "item";
        const label = document.createElement("button");
        label.className = "name";
        label.innerHTML = `<span style="color:${rule.enabled ? "var(--text)" : "var(--muted)"}">` +
          `${escapeHtml(rule.pattern)} → ${escapeHtml(rule.phoneme || rule.replacement)}</span>` +
          `${rule.phoneme ? ' <span style="font-size:11px;color:var(--accent-2)">phoneme</span>' : ""}` +
          `${rule.enabled ? "" : ' <span style="font-size:11px">(off)</span>'}`;
        label.title = "Turn this rule on or off";
        label.onclick = async () => {
          await api("/api/pronunciations/save", { ...rule, enabled: !rule.enabled });
          loadPronunciations();
          previewPronunciation();
        };
        const remove = document.createElement("button");
        remove.className = "x";
        remove.textContent = "×";
        remove.onclick = async () => {
          await api("/api/pronunciations/delete", { id: rule.id });
          loadPronunciations();
          previewPronunciation();
        };
        row.append(label, remove);
        box.appendChild(row);
      }
    }

    function previewPronunciation() {
      clearTimeout(pronunciationTimer);
      pronunciationTimer = setTimeout(async () => {
        const text = $("pronTest").value;
        if (!text) return setStatus("pronTestOut", "");
        const ticket = ++pronunciationRequest;
        const response = await api(`/api/pronunciations/preview?text=${encodeURIComponent(text)}`);
        if (ticket !== pronunciationRequest) return;
        setStatus("pronTestOut", (response.applied || []).length
          ? `Will be spoken as: "${response.text}"` : "No rules match this line.",
          (response.applied || []).length ? "ok" : "");
      }, 300);
    }

    function showStorageStatus(status) {
      const ok = status && status.configured;
      $("storageState").textContent = ok ? "connected" : "not set up";
      $("storageState").style.color = ok ? "var(--muted)" : "var(--warn)";
      if (status && !ok && status.reason && status.reason !== "Not set up yet.")
        setStatus("storageStatus", status.reason, "err");
      else if (ok)
        setStatus("storageStatus", `Reached ${status.endpoint} · bucket "${status.bucket}"`, "ok");
    }

    function markKey(hasKey) {
      config.has_key = hasKey;
      $("keystate").textContent = hasKey ? "key connected" : "no API key yet";
      $("keystate").className = "keystate" + (hasKey ? "" : " no");
    }

    $("diskRefresh").onclick = loadDisk;
    $("diskTidy").onclick = async () => {
      setStatus("diskStatus", "Tidying…", "busy");
      const response = await api("/api/disk/tidy", { days: 0 });
      if (response.error) return setStatus("diskStatus", response.error, "err");
      await loadDisk();
      setStatus("diskStatus", response.removed
        ? `Removed ${response.removed} working file${response.removed === 1 ? "" : "s"}, ` +
          `freed ${asMB(response.freed)}. Your audio is untouched.`
        : "Nothing needed clearing.", "ok");
    };
    $("saveAdvanced").onclick = async () => {
      const flags = {};
      $("synthFlags").querySelectorAll("[data-flag]").forEach(box => {
        flags[box.dataset.flag] = box.checked;
      });
      const response = await api("/api/prefs", {
        synth_flags: flags, extra_params: $("extraParams").value,
        fix_dates_phones: $("fixDatesPhones").checked,
        day_first: $("dayFirst").value === "1",
      });
      if (response.error) return setStatus("advancedStatus", response.error, "err");
      config.prefs = response;
      setStatus("advancedStatus", "Saved — applies to every render from now on.", "ok");
    };
    $("saveLimits").onclick = async () => {
      const response = await api("/api/prefs", {
        warn_above: parseFloat($("warnAbove").value) || 0,
        daily_cap: parseFloat($("dailyCap").value) || 0,
      });
      if (response.error) return setStatus("limitStatus", response.error, "err");
      config.prefs = response;
      setStatus("limitStatus", "Saved.", "ok");
    };
    $("pronAdd").onclick = async () => {
      const pattern = $("pronPattern").value.trim();
      const replacement = $("pronReplacement").value.trim();
      const phoneme = $("pronPhoneme").value.trim();
      if (!pattern) return setStatus("pronTestOut", "Type the word first.", "err");
      if (!replacement && !phoneme)
        return setStatus("pronTestOut", "Give it either a respelling or a phoneme spelling.", "err");
      const response = await api("/api/pronunciations/save", {
        pattern, replacement, whole_word: true, match_case: false, enabled: true,
        phoneme: phoneme || null,
      });
      if (!response.id) return setStatus("pronTestOut", "Need the database for this.", "err");
      $("pronPattern").value = $("pronReplacement").value = $("pronPhoneme").value = "";
      loadPronunciations();
    };
    $("pronTest").addEventListener("input", previewPronunciation);
    $("saveDir").onclick = async () => {
      const response = await api("/api/prefs", { out_dir: $("outDir").value });
      if (response.error) return setStatus("dirStatus", response.error, "err");
      config.out_dir = response.out_dir;
      setStatus("dirStatus", "Saved. New audio goes here.", "ok");
    };
    $("openDir").onclick = () => api("/api/reveal", {});
    $("saveStorage").onclick = async () => {
      setStatus("storageStatus", "Saving and testing…", "busy");
      const response = await api("/api/storage", {
        endpoint: $("stEndpoint").value, bucket: $("stBucket").value,
        region: $("stRegion").value, access_key: $("stAccess").value,
        secret_key: $("stSecret").value,
      });
      if (response.error) return setStatus("storageStatus", response.error, "err");
      $("stAccess").value = $("stSecret").value = "";
      showStorageStatus(response.status);
    };
    $("testStorage").onclick = async () => {
      setStatus("storageStatus", "Testing…", "busy");
      showStorageStatus(await api("/api/storage/test", {}));
    };
    $("saveNewKey").onclick = async () => {
      const response = await api("/api/key", { key: $("newKey").value,
                                               region: $("newRegion").value });
      if (response.error) return setStatus("newKeyStatus", response.error, "err");
      $("newKey").value = "";
      setStatus("newKeyStatus", "Key saved.", "ok");
      markKey(true);
    };
    $("saveWorkspace").onclick = async () => {
      const response = await api("/api/alibaba", {
        workspace_id: $("workspaceId").value, region: $("newRegion").value,
      });
      if (response.error) return setStatus("newKeyStatus", response.error, "err");
      config.workspace = response.workspace;
      setStatus("newKeyStatus", response.workspace.configured
        ? "Workspace-specific Singapore/Beijing routing is active."
        : "Legacy global endpoint routing is active.", "ok");
    };
    $("saveKey").onclick = async () => {
      setStatus("keyStatus", "Saving…", "busy");
      const response = await api("/api/key", { key: $("keyInput").value,
                                               region: $("regionInput").value });
      if (response.error) return setStatus("keyStatus", response.error, "err");
      $("keyDialog").close();
      markKey(true);
      loadCloned();
    };

    return Object.freeze({ loadDisk, renderSynthFlags, loadPronunciations,
                           showStorageStatus, markKey });
  }

  global.StudioSettings = Object.freeze({ create });
})(window);
