/* Parts and takes contract, independent of any Projects DOM. */
(function exposeStudioPartsApi(global) {
  "use strict";

  function create({ request, spendGuarded }) {
    return Object.freeze({
      get: id => request(`/api/generation?id=${encodeURIComponent(id)}`),
      full: id => request(`/api/generation/full?id=${encodeURIComponent(id)}`),
      duplicate: id => request("/api/part/duplicate", { id }),
      move: (id, projectId) =>
        request("/api/generation/move", { id, project_id: projectId }),
      remove: (id, { deleteFile = false } = {}) =>
        request("/api/generation/delete", { id, delete_file: deleteFile }),
      removeMany: ids => request("/api/parts/delete", { ids }),
      moveMany: (ids, projectId) =>
        request("/api/parts/move", { ids, project_id: projectId }),
      takes: id => request("/api/part/takes", { id }),
      promote: id => request("/api/part/promote", { id }),
      draft: payload => request("/api/part/draft", payload),
      render: (id, settings = {}) =>
        spendGuarded("/api/part/render", { id, ...settings }, "Record part"),
      renderDrafts: id =>
        spendGuarded("/api/project/render-drafts", { id }, "Record drafts"),
      regenerate: payload =>
        spendGuarded("/api/part/regenerate", payload, "Another take"),
    });
  }

  global.StudioPartsApi = Object.freeze({ create });
})(window);
