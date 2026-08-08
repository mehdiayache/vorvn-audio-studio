/* External subtitles owns uploaded-audio transcription, vocabularies and translations. */
(function exposeStudioSubtitles(global) {
  "use strict";

  function create({ get, api, setStatus, escapeHtml, player, ui,
                    audioTrigger, fileDrop }) {
    const $ = get;
    let transcript = null;
    let track = null;
    let vocabulary = { max_words: 500, default_weight: 4, languages: {} };

    const download = (name, text, type = "text/plain") => {
      const blob = new Blob([text], { type });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    };

    async function loadLanguages() {
      if ($("trTarget").options.length) return;
      const data = await api("/api/languages");
      for (const name of data.languages || []) $("trTarget").add(new Option(name, name));
      $("trTarget").value = "French";
    }

    async function loadVocabularies(selectId) {
      const data = await api("/api/vocabularies");
      if (data.error) return { error: data.error };
      vocabulary = { ...vocabulary, ...data };
      const target = $("subVocab");
      const keep = target.value;
      target.innerHTML = "";
      target.add(new Option("None", ""));
      for (const item of data.vocabularies || []) target.add(new Option(item.name, item.id));
      if (keep) target.value = keep;
      const picker = $("vocabList");
      const keepPicker = picker.value;
      picker.innerHTML = "";
      picker.add(new Option("+ New list", "__new__"));
      for (const item of data.vocabularies || []) picker.add(new Option(item.name, item.id));
      picker.value = selectId || keepPicker || "__new__";
      return data;
    }

    const wordLines = () => $("vocabWords").value.split("\n")
      .map(value => value.trim()).filter(Boolean);
    const updateWordCount = () => {
      const count = wordLines().length;
      $("vocabCount").textContent = count;
      $("vocabCount").style.color = count > vocabulary.max_words ? "var(--bad)" : "";
    };
    const showRejected = rejected => {
      const box = $("vocabRejected");
      if (!rejected || !rejected.length) { box.style.display = "none"; return; }
      box.style.display = "";
      box.innerHTML = `<p class="hint" style="margin:0 0 6px;color:var(--warn)">` +
        `${rejected.length} not saved:</p>` + rejected.map(item =>
          `<div class="hint" style="margin:0">· <b>${escapeHtml(item.text || "(blank)")}</b>` +
          ` — ${escapeHtml(item.reason)}</div>`).join("");
    };

    async function pickVocabulary() {
      const id = $("vocabList").value;
      const isNew = id === "__new__";
      $("vocabNaming").style.display = isNew ? "" : "none";
      $("vocabDelete").style.display = isNew ? "none" : "";
      $("vocabSave").textContent = isNew ? "Create list" : "Save changes";
      showRejected(null);
      if (isNew) {
        $("vocabWords").value = $("vocabPrefix").value = "";
        updateWordCount();
        return;
      }
      setStatus("vocabStatus", "Loading words…", "busy");
      const data = await api(`/api/vocabulary?id=${encodeURIComponent(id)}`);
      if (data.error) return setStatus("vocabStatus", data.error, "err");
      $("vocabWords").value = (data.words || []).map(word => word.text).join("\n");
      const first = (data.words || [])[0];
      if (first) {
        $("vocabWeight").value = first.weight || vocabulary.default_weight;
        $("vocabWeightVal").textContent = $("vocabWeight").value;
        if (first.lang) $("vocabLang").value = first.lang;
      }
      updateWordCount();
      setStatus("vocabStatus", `${(data.words || []).length} words in this list.`, "");
    }

    async function openVocabulary() {
      setStatus("vocabStatus", "Loading your lists…", "busy");
      showRejected(null);
      if (!$("vocabDialog").open) $("vocabDialog").showModal();
      const data = await loadVocabularies();
      if (data.error) return setStatus("vocabStatus", data.error, "err");
      $("vocabMax").textContent = vocabulary.max_words;
      $("vocabWeight").value = vocabulary.default_weight;
      $("vocabWeightVal").textContent = vocabulary.default_weight;
      if (!$("vocabLang").options.length) {
        $("vocabLang").add(new Option("Any", ""));
        for (const [code, name] of Object.entries(vocabulary.languages || {}))
          $("vocabLang").add(new Option(name, code));
      }
      await pickVocabulary();
      setStatus("vocabStatus", "");
    }

    function showTranscript(response) {
      transcript = response;
      $("subResultCard").style.display = "";
      $("subTextOut").textContent = response.text;
      $("subSrtOut").textContent = response.srt;
      $("subVttOut").textContent = response.vtt;
      const audioSource = response.url || "";
      track = audioSource ? { url: audioSource, name: response.file || "subtitle-source",
        title: response.file || "Subtitle source", meta: "Subtitle source audio" } : null;
      $("subListen").style.display = audioSource ? "" : "none";
      audioTrigger.bind({ button: $("subListen"), player, getTrack: () => track,
        idleLabel: "Listen to the source audio", playingLabel: "Pause the source audio" });
      $("subMeta").textContent = `${response.sentences.length} lines · ` +
        `${(response.duration_ms / 1000).toFixed(1)}s`;
      const box = $("subCues");
      box.innerHTML = "";
      const cueTime = ms => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:` +
        `${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
      for (const sentence of response.sentences) {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `<button class="name"><span style="color:var(--muted)">` +
          `${cueTime(sentence.start)}</span> ${escapeHtml(sentence.text)}</button>`;
        row.querySelector("button").onclick = () => {
          const current = track || player.track;
          if (current) player.seek(current, sentence.start / 1000);
        };
        box.appendChild(row);
      }
    }

    function busy(on, message) {
      $("subProgress").style.display = on ? "" : "none";
      if (message) $("subProgressText").textContent = message;
      $("subGo").disabled = $("subUploadBtn").disabled = on;
      $("subGo").textContent = on ? "Working…" : "Write the subtitles";
      $("subUploadBtn").textContent = on ? "Working…" : "Upload and write the subtitles";
    }

    async function loadHistory() {
      const data = await api("/api/transcripts");
      const box = $("subHistory");
      box.innerHTML = "";
      const rows = data.transcripts || [];
      if (!rows.length) { box.innerHTML = '<span class="hint">Nothing yet.</span>'; return; }
      for (const saved of rows) {
        const item = document.createElement("div");
        item.className = "item";
        const open = document.createElement("button");
        open.className = "name";
        open.innerHTML = `<span style="color:var(--text)">${escapeHtml(saved.name)}</span><br>` +
          `<span style="font-size:11px">${saved.when} · ${saved.lines} lines</span>`;
        open.onclick = async () => {
          const full = await api(`/api/transcript?id=${saved.id}`);
          if (full.error) return setStatus("subStatus", full.error, "err");
          showTranscript(full);
        };
        const remove = document.createElement("button");
        remove.className = "x";
        remove.textContent = "×";
        remove.onclick = async () => {
          await api("/api/transcript/delete", { id: saved.id });
          loadHistory();
        };
        item.append(open, remove);
        box.appendChild(item);
      }
    }

    $("trGo").onclick = async () => {
      if (!transcript?.id)
        return setStatus("subStatus", "Write or open some subtitles first.", "err");
      const target = $("trTarget").value;
      $("trGo").disabled = true;
      busy(true, `Translating into ${target}…`);
      setStatus("subStatus", "");
      const response = await api("/api/translate/subtitles", {
        id: transcript.id, target, quality: $("trQuality").value,
      });
      busy(false);
      $("trGo").disabled = false;
      if (response.error) return setStatus("subStatus", response.error, "err");
      showTranscript(response);
      loadHistory();
      setStatus("subStatus", `Translated into ${target} — same timings, saved as its own copy ` +
        `so the original is untouched.`, "ok");
    };
    $("vocabManage").onclick = event => { event.preventDefault(); openVocabulary(); };
    $("vocabList").onchange = pickVocabulary;
    $("vocabClose").onclick = () => $("vocabDialog").close();
    $("vocabWords").addEventListener("input", updateWordCount);
    $("vocabWeight").addEventListener("input", event =>
      $("vocabWeightVal").textContent = event.target.value);
    $("vocabPrefix").addEventListener("input", event => {
      const cleaned = event.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      if (cleaned !== event.target.value) event.target.value = cleaned;
    });
    $("vocabSave").onclick = async () => {
      const lines = wordLines();
      if (!lines.length) return setStatus("vocabStatus", "Add at least one word.", "err");
      const id = $("vocabList").value === "__new__" ? "" : $("vocabList").value;
      if (!id && !$("vocabPrefix").value.trim())
        return setStatus("vocabStatus", "Give the list a short name first.", "err");
      $("vocabSave").disabled = true;
      setStatus("vocabStatus", "Saving…", "busy");
      const weight = parseInt($("vocabWeight").value, 10);
      const lang = $("vocabLang").value || undefined;
      const response = await api("/api/vocabulary/save", { id,
        prefix: $("vocabPrefix").value.trim(),
        words: lines.map(text => ({ text, weight, lang })) });
      $("vocabSave").disabled = false;
      if (response.error) {
        showRejected(response.rejected);
        return setStatus("vocabStatus", response.error, "err");
      }
      await loadVocabularies(response.id);
      $("subVocab").value = response.id;
      await pickVocabulary();
      showRejected(response.rejected);
      setStatus("vocabStatus", `Saved ${response.saved} word` +
        `${response.saved === 1 ? "" : "s"}. It's selected on the Subtitles tab.`, "ok");
    };
    $("vocabDelete").onclick = async () => {
      const id = $("vocabList").value;
      if (id === "__new__") return;
      if (!await ui.confirm("Delete this word list?",
        "Subtitles you've already made are unaffected.")) return;
      setStatus("vocabStatus", "Deleting…", "busy");
      const response = await api("/api/vocabulary/delete", { id });
      if (response.error) return setStatus("vocabStatus", response.error, "err");
      if ($("subVocab").value === id) $("subVocab").value = "";
      await loadVocabularies("__new__");
      await pickVocabulary();
      setStatus("vocabStatus", "Deleted.", "ok");
    };
    $("subUploadBtn").style.display = "";
    $("subTabs").querySelectorAll("button").forEach(button => button.onclick = () => {
      $("subTabs").querySelectorAll("button").forEach(item => item.classList.remove("on"));
      button.classList.add("on");
      document.querySelectorAll("#tab-subtitles .subview").forEach(view => view.style.display = "none");
      const map = { lines: "subViewLines", text: "subViewText",
        srt: "subViewSrt", vtt: "subViewVtt" };
      $(map[button.dataset.view]).style.display = "";
    });
    document.querySelectorAll("#tab-subtitles [data-copy]").forEach(button => button.onclick = () => {
      if (!transcript) return;
      const value = { text: transcript.text, srt: transcript.srt,
        vtt: transcript.vtt }[button.dataset.copy];
      navigator.clipboard.writeText(value).then(() =>
        setStatus("subStatus", `${button.dataset.copy.toUpperCase()} copied.`, "ok"));
    });
    document.querySelectorAll("#tab-subtitles [data-save]").forEach(button => button.onclick = () => {
      if (!transcript) return;
      const kind = button.dataset.save;
      const body = { txt: transcript.text, srt: transcript.srt, vtt: transcript.vtt }[kind];
      download(`${(transcript.file || "subtitles").replace(/\.[^.]+$/, "")}.${kind}`, body);
    });
    $("subUploadBtn").onclick = async () => {
      const file = $("subUpload").files[0];
      if (!file) return setStatus("subStatus", "Choose a file first.", "err");
      busy(true, `Uploading ${file.name}…`);
      setStatus("subStatus", "");
      try {
        const uploaded = await fetch("/api/transcribe/upload", { method: "POST",
          headers: { "X-Filename": encodeURIComponent(file.name) }, body: file })
          .then(response => response.json());
        if (uploaded.error) { busy(false); return setStatus("subStatus", uploaded.error, "err"); }
        $("subProgressText").textContent = "Listening to the audio — this can take a minute…";
        const response = await api("/api/transcribe", { url: uploaded.url,
          name: uploaded.name, playable: uploaded.playable, size_bytes: uploaded.size_bytes,
          language: $("subLang").value === "Auto" ? "" : $("subLang").value,
          vocabulary_id: $("subVocab").value });
        busy(false);
        if (response.error) return setStatus("subStatus", response.error, "err");
        showTranscript(response);
        setStatus("subStatus", `Done — ${response.sentences.length} lines.`, "ok");
        loadHistory();
      } catch (error) {
        busy(false);
        setStatus("subStatus", String(error), "err");
      }
    };
    fileDrop.bind({ target: $("subUploadDrop"), input: $("subUpload"), onFiles: files => {
      const file = files[0];
      if (file) setStatus("subStatus", `${file.name} is ready. ` +
        `Click Upload and write the subtitles to start.`, "ok");
    }});
    $("subGo").onclick = async () => {
      const file = $("subFile").value;
      if (!file) return setStatus("subStatus", "Pick a file first.", "err");
      busy(true, "Sending the audio to your storage…");
      setStatus("subStatus", "");
      setTimeout(() => $("subProgressText").textContent =
        "Listening to the audio — this can take a minute…", 2500);
      const response = await api("/api/transcribe", { file,
        language: $("subLang").value === "Auto" ? "" : $("subLang").value,
        vocabulary_id: $("subVocab").value });
      busy(false);
      if (response.error) return setStatus("subStatus", response.error, "err");
      showTranscript(response);
      setStatus("subStatus", `Done — ${response.sentences.length} lines.`, "ok");
      loadHistory();
    };

    return Object.freeze({ loadLanguages, loadVocabularies, loadHistory });
  }

  global.StudioSubtitles = Object.freeze({ create });
})(window);
