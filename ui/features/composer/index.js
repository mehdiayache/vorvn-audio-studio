/* The single movable Composer session. It owns destination/editing state and
   the transition between Speak and Projects; paid generation remains outside. */
(function exposeStudioComposer(global) {
  "use strict";

  function create(deps) {
    const { get, captureSession, restoreSession, syncEngine, syncSpeechMode,
            loadStates, drawVoice, updateCount, updateInstruction, updateRoute,
            clearStatus, refreshTags, showInspector, nextPartNumber,
            getOpenProject, refreshOpenProject } = deps;
    const composer = {
      target: null,
      editing: null,
      homeSession: null,
      at: null,

      home() {
        if (get("composerDialog").open) get("composerDialog").close();
        get("projectComposerInline").hidden = true;
        get("projectComposerInline").classList.remove("show-settings");
        this.editing = null;
        const speak = get("tab-speak").querySelector(".cols");
        speak.children[0].insertBefore(get("composerLeft"), speak.children[0].firstChild);
        const wasIn = this.target;
        this.target = null;
        this.at = null;
        restoreSession(this.homeSession);
        this.homeSession = null;
        this.describe();
        const openProject = getOpenProject();
        if (wasIn && openProject && wasIn.id === openProject.id)
          refreshOpenProject(openProject.parts || []);
      },

      open({ project = null, at = null, title = "New part", part = null } = {}) {
        if (!this.homeSession && !get("composerDialog").open)
          this.homeSession = captureSession();
        this.target = project;
        this.editing = part;
        this.at = at;

        if (part) {
          get("text").value = part.text || "";
          get("engine").value = part.engine || "audio";
          get("model").value = part.model || "plus";
          syncEngine();
          if (![...get("voice").options].some(option => option.value === part.voice))
            get("voice").insertBefore(new Option(part.voice, part.voice), get("voice").firstChild);
          get("voice").value = part.voice;
          get("instruction").value = part.instruction || "";
          get("omniDirection").value = part.instruction || "";
          get("speechMode").value = part.speech_mode || "exact";
          syncSpeechMode();
          get("language").value = part.language || "Auto";
          get("format").value = part.format || "mp3";
          get("rate").value = part.rate ?? 1;
          get("rateVal").textContent = `${part.rate ?? 1}×`;
          get("pitch").value = part.pitch ?? 1;
          get("pitchVal").textContent = `${part.pitch ?? 1}×`;
          get("volume").value = part.volume ?? 50;
          get("volVal").textContent = part.volume ?? 50;
          get("seed").value = part.seed ?? 0;
          loadStates(part);
          drawVoice();
          updateCount();
          updateInstruction();
          updateRoute();
        } else {
          get("text").value = "";
          clearStatus();
          loadStates(null);
          updateCount();
          refreshTags();
          updateRoute();
        }

        const isDraft = part?.kind === "draft";
        const where = project
          ? [...(project.trail || []).map(step => step.name), project.name].join(" › ")
          : "Saved to Unsorted";
        get("composerTitle").textContent = title;
        get("composerWhere").textContent = where;
        get("projectComposerTitle").textContent = title;
        get("projectComposerWhere").textContent = where;
        const inline = !!project;
        const slot = inline ? get("projectComposerSlot") : get("composerSlot");
        slot.appendChild(get("composerLeft"));
        get("projectComposerInline").hidden = !inline;
        get("projectComposerInline").classList.remove("show-settings");
        get("saveDraft").hidden = !!part && !isDraft;
        get("saveDraft").style.display = "";
        get("saveDraft").textContent = isDraft ? "Save draft" : "Save as draft";
        showInspector("settings");
        this.describe();
        if (!inline && !get("composerDialog").open) get("composerDialog").showModal();
        if (inline) get("projectComposerInline").scrollIntoView({ block: "center", behavior: "smooth" });
        get("text").focus();
      },

      actionLabel() {
        const position = this.editing
          ? (this.editing.position ?? 0) + 1
          : this.at === null ? nextPartNumber(this.target) : this.at + 1;
        if (!this.target) return "Generate";
        if (this.editing?.kind === "draft") return `Record Part ${position}`;
        if (this.editing) return `Generate new take · Part ${position}`;
        return `Generate & add Part ${position}`;
      },

      describe() {
        const position = (this.editing?.position ?? 0) + 1;
        const message = this.target && this.editing
          ? (this.editing.kind === "draft"
              ? `editing part ${position} of "${this.target.name}"`
              : `saving a new take for part ${position} of "${this.target.name}"`)
          : this.target
            ? `saving to ${this.at === null
                ? `part ${nextPartNumber(this.target)}` : `part ${this.at + 1}`} ` +
              `of "${this.target.name}"`
            : "saving to Unsorted";
        get("whereTo").textContent = message;
        get("whereTo").title = "Where the next generation is filed";
        get("go").textContent = this.actionLabel();
      },
    };
    return composer;
  }

  global.StudioComposer = Object.freeze({ create });
})(window);
