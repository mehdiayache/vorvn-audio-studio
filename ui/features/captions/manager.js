/* One caption workspace for a recorded part: original recognition,
   translations, preview and exact-file download. Paid calls stay injected. */
(function exposeStudioCaptionManager(global) {
  "use strict";

  function create(deps) {
    const { get, languages, getLanguages, getTranscript, transcribe, translate,
            confirm, refreshPart, downloadText, clock, escapeHtml } = deps;
    const manager = {
      part: null,
      focus: "original",
      transcripts: [],
      current: null,
      currentData: null,
      session: 0,
      selectRequest: 0,

      async open(part, { focus = "original" } = {}) {
        const session = ++this.session;
        this.part = part;
        this.focus = focus;
        this.current = null;
        this.currentData = null;
        get("captionTitle").textContent = `Captions · Part ${(part.position || 0) + 1}`;
        get("captionWhere").textContent = (part.text || part.title || "").slice(0, 140);
        this.status("Loading captions…", "busy");
        if (!get("captionDialog").open) get("captionDialog").showModal();
        await this.reload(null, session);
      },

      async reload(preferId = null, session = this.session) {
        const result = await getLanguages(this.part.id);
        if (session !== this.session) return;
        if (result.error) return this.status(result.error, "err");
        this.transcripts = result.transcripts || [];
        const original = this.transcripts.find(item => !item.is_translation);
        const translated = this.transcripts.filter(item => item.is_translation);
        const stale = !!original?.stale || !!this.part.subtitles_stale;

        get("captionCreate").hidden = !!original && !stale;
        get("captionCreate").textContent = original ? "Regenerate original" : "Create subtitles";
        get("captionStale").hidden = !stale;
        get("captionTranslateBar").hidden = !original || stale;
        this.fillLanguages(translated);
        this.drawFiles();

        const selected = this.transcripts.find(item => String(item.id) === String(preferId))
          || (this.focus === "translations" ? translated[0] : original)
          || original || translated[0];
        get("captionEmpty").hidden = !!selected;
        get("captionPreview").hidden = !selected;
        if (selected) await this.select(selected.id);
        else this.status("No captions yet.", "");
      },

      fillLanguages(existing) {
        const select = get("captionLanguage");
        select.innerHTML = "";
        const used = new Set(existing.map(item => item.language));
        for (const language of languages.filter(item => !used.has(item)))
          select.add(new Option(language, language));
        get("captionTranslate").disabled = !select.options.length;
      },

      drawFiles() {
        const box = get("captionFiles");
        box.innerHTML = "";
        for (const item of this.transcripts) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `caption-file${String(item.id) === String(this.current) ? " on" : ""}`;
          const label = item.is_translation ? item.language : "Original";
          const detail = item.is_translation ? "Translation" : (item.language || "Detected language");
          button.innerHTML = `<span><b>${escapeHtml(label || "Translation")}</b>` +
            `<small>${escapeHtml(detail)} · ${clock((item.duration_ms || 0) / 1000)}</small></span>` +
            (item.stale ? '<em>Out of date</em>' : "");
          button.onclick = () => this.select(item.id);
          box.appendChild(button);
        }
      },

      async select(id) {
        const request = ++this.selectRequest;
        this.current = id;
        this.drawFiles();
        this.status("Opening file…", "busy");
        const data = await getTranscript(id);
        if (request !== this.selectRequest) return;
        if (data.error) return this.status(data.error, "err");
        this.currentData = data;
        const item = this.transcripts.find(entry => String(entry.id) === String(id));
        get("captionPreviewTitle").textContent = item?.is_translation
          ? `${item.language} translation` : "Original subtitles";
        get("captionPreviewMeta").textContent = `${(data.sentences || []).length} lines · ` +
          `${clock((data.duration_ms || 0) / 1000)}`;
        get("captionPreview").hidden = false;
        get("captionEmpty").hidden = true;
        this.drawPreview();
        this.status("", "");
      },

      drawPreview() {
        if (!this.currentData) return;
        const format = get("captionFormat").value;
        get("captionText").textContent = format === "vtt" ? this.currentData.vtt
          : format === "txt" ? this.currentData.text : this.currentData.srt;
      },

      async makeOriginal() {
        const replacing = this.transcripts.some(item => !item.is_translation);
        const approved = await confirm(
          replacing ? "Regenerate subtitles from this audio?" : "Create subtitles for this part?",
          "Alibaba speech recognition is billed by audio duration. The saved result is reused, so opening or downloading it later is free.",
          replacing ? "Regenerate" : "Create subtitles");
        if (!approved) return;
        this.status("Listening to the audio…", "busy");
        const result = await transcribe(this.part);
        if (result === null) return this.status("Cancelled — nothing charged.", "");
        if (result.error) return this.status(result.error, "err");
        this.part.subtitled = true;
        this.part.subtitles_stale = false;
        await refreshPart(this.part.id);
        this.status(`Subtitles ready · ${(result.sentences || []).length} lines.`, "ok");
        await this.reload(result.id);
      },

      async makeTranslation() {
        const original = this.transcripts.find(item => !item.is_translation);
        const target = get("captionLanguage").value;
        if (!original || !target) return;
        this.status(`Translating into ${target}…`, "busy");
        const result = await translate(original.id, target);
        if (result === null) return this.status("Cancelled — nothing charged.", "");
        if (result.error) return this.status(result.error, "err");
        await refreshPart(this.part.id);
        this.focus = "translations";
        this.status(`${target} translation ready.`, "ok");
        await this.reload(result.id);
      },

      download() {
        if (!this.currentData) return;
        const format = get("captionFormat").value;
        const body = format === "vtt" ? this.currentData.vtt
          : format === "txt" ? this.currentData.text : this.currentData.srt;
        const stem = (this.currentData.file || "captions").replace(/\.[^.]+$/, "")
          .replace(/[^\p{L}\p{N}._-]+/gu, "-");
        downloadText(`${stem}.${format}`, body);
      },

      status(message, kind) {
        const node = get("captionStatus");
        node.textContent = message;
        node.className = `status${kind ? ` ${kind}` : ""}`;
      },

      close() {
        this.session += 1;
        this.selectRequest += 1;
        if (get("captionDialog").open) get("captionDialog").close();
        this.part = null;
        this.transcripts = [];
        this.current = null;
        this.currentData = null;
      },
    };

    get("captionClose").addEventListener("click", () => manager.close());
    get("captionDialog").addEventListener("cancel", event => {
      event.preventDefault();
      manager.close();
    });
    get("captionCreate").addEventListener("click", () => manager.makeOriginal());
    get("captionTranslate").addEventListener("click", () => manager.makeTranslation());
    get("captionFormat").addEventListener("change", () => manager.drawPreview());
    get("captionDownload").addEventListener("click", () => manager.download());
    return manager;
  }

  global.StudioCaptionManager = Object.freeze({ create });
})(window);
