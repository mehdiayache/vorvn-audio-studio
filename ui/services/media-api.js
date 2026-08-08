/* Generic media uploads. The legacy server currently shares the project-icon
   endpoint; callers depend on the media operation, not that temporary route. */
(function exposeStudioMediaApi(global) {
  "use strict";

  function create({ upload }) {
    return Object.freeze({
      uploadImage: (file, filename = file?.name || "image") =>
        upload("/api/project/icon/upload", file, { "X-Filename": filename }),
    });
  }

  global.StudioMediaApi = Object.freeze({ create });
})(window);
