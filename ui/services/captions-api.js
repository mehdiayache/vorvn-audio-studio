/* Original recognition and translated-caption contract. */
(function exposeStudioCaptionsApi(global) {
  "use strict";

  function create({ request, spendGuarded }) {
    return Object.freeze({
      list: partId => request(`/api/part/languages?id=${encodeURIComponent(partId)}`),
      get: transcriptId => request(`/api/transcript?id=${encodeURIComponent(transcriptId)}`),
      transcribe: part => spendGuarded("/api/transcribe", {
        file: part.filename, generation_id: part.id,
      }, "Create subtitles"),
      translate: (transcriptId, target) =>
        spendGuarded("/api/translate/subtitles", { id: transcriptId, target },
                     `Translate subtitles into ${target}`),
    });
  }

  global.StudioCaptionsApi = Object.freeze({ create });
})(window);
