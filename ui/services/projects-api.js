/* Current Projects transport contract. This is the compatibility adapter the
   existing UI uses now; a future /api/v1 adapter can implement the same shape. */
(function exposeStudioProjectsApi(global) {
  "use strict";

  function create({ request, upload }) {
    return Object.freeze({
      list: () => request("/api/projects"),
      get: id => request(`/api/project?id=${encodeURIComponent(id)}`),
      create: ({ name, parentId = null }) =>
        request("/api/project/create", { name, parent_id: parentId }),
      rename: (id, name) => request("/api/project/rename", { id, name }),
      describe: (id, description) =>
        request("/api/project/describe", { id, description }),
      move: (id, parentId) =>
        request("/api/project/move", { id, parent_id: parentId }),
      remove: (id, { keepAudio = true } = {}) =>
        request("/api/project/delete", { id, keep_audio: keepAudio }),
      reorder: (id, order) => request("/api/project/reorder", { id, order }),
      addSilence: (id, seconds, insertAt = null) =>
        request("/api/project/silence", { project_id: id, seconds, insert_at: insertAt }),
      editSilence: (id, seconds) =>
        request("/api/project/silence/edit", { id, seconds }),
      stitch: id => request("/api/project/stitch", { id }),
      preview: id => request("/api/project/preview", { id }),
      music: id => request(`/api/project/music?id=${encodeURIComponent(id)}`),
      setMusic: (id, settings) =>
        request("/api/project/music", { id, ...settings }),
      naming: id => request(`/api/project/naming?id=${encodeURIComponent(id)}`),
      setNaming: (id, naming) => request("/api/project/naming", { id, naming }),
      setIcon: (id, icon) => request("/api/project/icon", { id, icon }),
      uploadIcon: (file, filename = file?.name || "icon") =>
        upload("/api/project/icon/upload", file, { "X-Filename": filename }),
    });
  }

  global.StudioProjectsApi = Object.freeze({ create });
})(window);
