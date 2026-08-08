/* Venture-library contract used by the reusable Asset Browser. */
(function exposeStudioAssetsApi(global) {
  "use strict";

  function create({ request, upload }) {
    return Object.freeze({
      list: projectId => request(`/api/assets?id=${encodeURIComponent(projectId)}`),
      insert: ({ projectId, assetId, at = null }) =>
        request("/api/asset/insert", {
          project_id: projectId, asset_id: assetId, insert_at: at,
        }),
      upload: (projectId, file) => upload("/api/asset/upload", file, {
        "X-Project-Id": String(projectId),
        "X-Filename": encodeURIComponent(file.name),
      }),
    });
  }

  global.StudioAssetsApi = Object.freeze({ create });
})(window);
