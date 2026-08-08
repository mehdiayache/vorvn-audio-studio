/* One drag-and-drop contract for every file input in the studio. The feature
   still owns what happens to a file; this component only owns browser drag
   semantics, input synchronisation and visual feedback. */
(function exposeFileDrop(global) {
  "use strict";

  function assign(input, files) {
    if (!input || !files?.length || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    [...files].forEach(file => transfer.items.add(file));
    input.files = transfer.files;
  }

  function bind({ target, input = null, onFiles, activeClass = "dropping" }) {
    if (!target) return Object.freeze({ destroy() {} });
    let depth = 0;
    const hasFiles = event => [...(event.dataTransfer?.types || [])].includes("Files");
    const enter = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth += 1;
      target.classList.add(activeClass);
    };
    const over = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = event => {
      event.stopPropagation();
      depth = Math.max(0, depth - 1);
      if (!depth) target.classList.remove(activeClass);
    };
    const drop = event => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth = 0;
      target.classList.remove(activeClass);
      const files = event.dataTransfer.files;
      assign(input, files);
      onFiles?.(files, event);
    };
    target.addEventListener("dragenter", enter);
    target.addEventListener("dragover", over);
    target.addEventListener("dragleave", leave);
    target.addEventListener("drop", drop);
    return Object.freeze({
      destroy() {
        target.removeEventListener("dragenter", enter);
        target.removeEventListener("dragover", over);
        target.removeEventListener("dragleave", leave);
        target.removeEventListener("drop", drop);
      },
    });
  }

  global.StudioFileDrop = Object.freeze({ bind, assign });
})(window);
