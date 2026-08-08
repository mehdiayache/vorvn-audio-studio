/* Background music for one production folder. The feature owns its controls
   and state; Projects only supplies the active context and redraws its strip. */
(function exposeStudioProjectMusic(global) {
  "use strict";

  function create(deps) {
    const { get, projectService, assetService, getProject, isCurrent, player,
            ask, confirm, setStatus, clock, openLibrary, onChange } = deps;
    let current = {};

    function render() {
      const has = !!current.filename;
      get("musicName").textContent = has
        ? `${current.name || "a track"} · ${clock((current.duration_ms || 0) / 1000)}`
        : "none yet";
      get("musicPick").textContent = has ? "Change music" : "Add background music";
      get("musicPlay").style.display = has ? "" : "none";
      get("musicClear").style.display = has ? "" : "none";
      get("musicControls").style.display = has ? "" : "none";
      const volume = Math.round(Number(current.volume ?? .10) * 100);
      get("musicLevel").value = String(volume);
      get("musicVolumeValue").textContent = `${volume}%`;
      const sourceSeconds = Math.max(0, Number(current.duration_ms || 0) / 1000);
      get("musicStart").max = String(Math.max(0, sourceSeconds - .5));
      get("musicStart").value = String(Math.min(sourceSeconds, Number(current.start || 0)));
      get("musicStartValue").textContent = clock(Number(get("musicStart").value));
      get("musicFadeIn").value = current.fade_in ?? 2;
      get("musicFadeOut").value = current.fade_out ?? 4;
      get("musicDuck").checked = current.duck !== false;
      onChange?.(current);
    }

    async function load(projectId, request) {
      const result = await projectService.music(projectId) || {};
      if (!isCurrent(projectId, request)) return false;
      current = result;
      render();
      return true;
    }

    async function save(extra = {}) {
      const project = getProject();
      if (!project) return false;
      const result = await projectService.setMusic(project.id, {
        music_volume: Number(get("musicLevel").value) / 100,
        music_start: Number(get("musicStart").value) || 0,
        music_fade_in: parseFloat(get("musicFadeIn").value) || 0,
        music_fade_out: parseFloat(get("musicFadeOut").value) || 0,
        music_duck: get("musicDuck").checked,
        ...extra,
      });
      if (result?.error) {
        setStatus("projectStatus", result.error, "err");
        return false;
      }
      return load(project.id);
    }

    get("musicLevel").addEventListener("input", () => {
      get("musicVolumeValue").textContent = `${get("musicLevel").value}%`;
    });
    get("musicStart").addEventListener("input", () => {
      get("musicStartValue").textContent = clock(Number(get("musicStart").value));
    });
    for (const id of ["musicLevel", "musicStart", "musicFadeIn", "musicFadeOut", "musicDuck"])
      get(id).addEventListener("change", () => save());

    get("musicPick").onclick = async () => {
      const project = getProject();
      if (!project) return;
      const data = await assetService.list(project.id);
      if (data.error)
        return setStatus("projectStatus", data.error, "err");
      const music = (data.assets || []).filter(asset => asset.collection === "music");
      if (!music.length) {
        return setStatus("projectStatus",
          `Put a track in ${data.venture} › Assets › Music first — then it's ` +
          "available to every Production in this Venture.", "err");
      }
      const chosen = await ask({
        title: "Add music bed",
        body: "It stretches to the whole length by itself, and drops under the " +
              "voice if you leave ducking on.",
        choiceLabel: "Track",
        choices: music.map(asset => ({
          value: String(asset.id),
          label: `${(asset.title || asset.text || "untitled").slice(0, 50)} · ` +
                 clock((asset.duration_ms || 0) / 1000),
        })),
        value: current.music_of ? String(current.music_of) : undefined,
        ok: "Use this one",
      });
      if (!chosen) return;
      if (await save({ music_of: Number(chosen) }))
        setStatus("projectStatus", "Music set — it goes under the next stitch.", "ok");
    };

    get("musicLibrary").onclick = () => openLibrary?.();

    get("musicPlay").onclick = () => current.filename && player.toggle(
      `/audio/${current.filename}`,
      playing => {
        get("musicPlay").textContent = playing ? "Ⅱ Pause" : "Hear it";
        document.querySelectorAll('[data-timeline-action="music-play"]').forEach(button => {
          button.textContent = playing ? "Ⅱ" : "▶";
          button.title = playing ? "Pause the source track" : "Play the source track";
        });
      });

    get("musicClear").onclick = async () => {
      if (!await confirm("Remove the music?",
            "The track stays in the Venture's library — only this Production stops " +
            "using it.", "Remove")) return;
      if (await save({ music_of: null }))
        setStatus("projectStatus", "This Production no longer has background music.", "ok");
    };

    return Object.freeze({
      load,
      get current() { return current; },
    });
  }

  global.StudioProjectMusic = Object.freeze({ create });
})(window);
