/* The single movable voice catalogue. It owns picker state and the complete
   dialog lifecycle; catalogue data, rendering and business actions are injected. */
(function exposeStudioVoiceBrowser(global) {
  "use strict";

  function create(deps) {
    const { get, ensureLibrary, ensureUsage, getMode, setMode, setTier,
            draw, stopPlayer } = deps;
    const browser = {
      picking: null,

      home() {
        this.picking = null;
        if (getMode() === "picker") setMode("mine");
        const catalogue = get("voiceModeBrowse");
        const cloneMode = get("voiceModeClone");
        const shelf = cloneMode.parentElement;
        if (catalogue.parentElement !== shelf)
          shelf.insertBefore(catalogue, cloneMode);
        catalogue.style.display = getMode() === "clone" ? "none" : "";
        if (get("voicePickDialog").open) get("voicePickDialog").close();
      },

      async pick({ title = "Choose a voice", note = "", tier = null,
                   onChoose } = {}) {
        await ensureLibrary();
        await ensureUsage();
        this.picking = onChoose;
        get("voicePickTitle").textContent = title;
        get("voicePickNote").textContent = note;
        setTier(tier || "");
        setMode("picker");
        const catalogue = get("voiceModeBrowse");
        catalogue.style.display = "";
        get("voicePickSlot").appendChild(catalogue);
        draw();
        get("voicePickDialog").showModal();
      },

      choose(id) {
        const done = this.picking;
        stopPlayer();
        this.home();
        if (done) done(id);
      },

      cancel() {
        stopPlayer();
        this.home();
      },
    };

    get("voicePickClose").addEventListener("click", () => browser.cancel());
    get("voicePickDialog").addEventListener("cancel", event => {
      event.preventDefault();
      browser.cancel();
    });
    return browser;
  }

  global.StudioVoiceBrowser = Object.freeze({ create });
})(window);
