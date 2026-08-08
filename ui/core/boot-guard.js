/* A broken composition root must never degrade into a plausible but empty
   studio. Surface the first boot error so the operator knows data did not load. */
(function installBootGuard(global) {
  "use strict";

  function show(message) {
    const box = document.getElementById("bootFailure");
    if (!box || !message) return;
    box.textContent = `Voice Studio could not finish loading: ${message}`;
    box.hidden = false;
  }

  global.addEventListener("error", event => show(event.message));
  global.addEventListener("unhandledrejection", event =>
    show(event.reason?.message || String(event.reason || "Unknown error")));
})(window);
