/* One semantic take renderer with compact and detail presentations.
   It owns take identity and action placement; callers own API mutations. */
(function exposeTakeCard(global) {
  "use strict";

  function create({ voiceAvatar, voiceLabel, icon, clock, stamp, bindAudio }) {
    const button = (className, title, content) => {
      const el = document.createElement("button");
      el.className = className;
      el.title = title;
      if (content.startsWith("<")) el.innerHTML = content;
      else el.textContent = content;
      return el;
    };

    function render(take, { current = false, variant = "compact",
                            onUse = null, onDelete = null } = {}) {
      const detailed = variant === "detail";
      const root = document.createElement("div");
      root.className = (detailed ? "take-card" : "take-row") + (current ? " current" : "");

      if (detailed) {
        const top = document.createElement("div");
        top.className = "top";
        const avatar = document.createElement("span");
        avatar.innerHTML = voiceAvatar(take.voice, 22);
        const name = document.createElement("span");
        name.className = "nm";
        name.style.cssText = "font-size:12.5px;font-weight:600";
        name.textContent = voiceLabel(take.voice);
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = `${current ? "in use now" : stamp(take.when)} · ${take.rate}× · ` +
          `${take.pitch}× pitch${take.seed ? ` · seed ${take.seed}` : ""}` +
          `${take.duration_ms ? ` · ${clock(take.duration_ms / 1000)}` : ""} · ` +
          `$${Number(take.cost || 0).toFixed(4)}`;
        top.append(avatar, name, when);

        const words = document.createElement("div");
        words.className = "said-small";
        words.title = "Click to see the whole thing";
        words.textContent = take.text || "(no text)";
        words.onclick = () => words.classList.toggle("open");
        root.append(top, words);
      } else {
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = current ? "now in use" : stamp(take.when);
        const what = document.createElement("span");
        what.className = "what";
        what.title = take.voice || "";
        what.textContent = `${voiceLabel(take.voice)} · ${take.rate}× · ` +
          `${take.seed ? `seed ${take.seed} · ` : ""}$${Number(take.cost || 0).toFixed(4)}`;
        root.append(when, what);
        if (current) {
          const badge = document.createElement("span");
          badge.className = "take-badge";
          badge.textContent = "this is the one you hear";
          root.appendChild(badge);
        }
      }

      const tools = document.createElement("div");
      tools.className = detailed ? "row" : "take-actions";
      if (detailed) tools.style.marginTop = "8px";
      const listen = detailed
        ? button("ghost fit", "Play this take", "Play")
        : button("icon-btn", "Play this take", icon("play"));
      bindAudio(listen, take, { detailed, current });
      tools.appendChild(listen);

      if (!current && onUse) {
        const use = detailed
          ? button("ghost fit", "Make this the take in use", "Use this one")
          : button("icon-btn", "Make this the take in use", icon("check"));
        use.onclick = () => onUse(take);
        tools.appendChild(use);
      }
      if (!current && onDelete) {
        const remove = detailed
          ? button("ghost fit danger", "Delete this take for good", "Delete take")
          : button("icon-btn danger", "Delete this take for good", icon("close"));
        remove.onclick = () => onDelete(take);
        tools.appendChild(remove);
      }
      root.appendChild(tools);
      return root;
    }

    return Object.freeze({ render });
  }

  global.StudioTakeCard = Object.freeze({ create });
})(window);
