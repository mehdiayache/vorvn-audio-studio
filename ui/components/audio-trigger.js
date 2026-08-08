/* Connect any play control to the one StudioPlayer without letting a feature
   touch the shared audio element or manage stale Play/Pause state itself. */
(function exposeAudioTrigger(global) {
  "use strict";

  function bind({ button, player, getTrack, render, idleLabel = "Play",
                  playingLabel = "Pause" }) {
    const paint = playing => {
      button.dataset.playing = playing ? "true" : "false";
      button.setAttribute("aria-pressed", String(playing));
      if (render) return render(playing, button);
      const label = button.querySelector("b");
      const mark = button.querySelector(".audio-trigger-icon");
      if (label) label.textContent = playing ? playingLabel : idleLabel;
      else button.textContent = playing ? playingLabel : idleLabel;
      if (mark) mark.textContent = playing ? "Ⅱ" : "▶";
    };

    button.onclick = () => {
      const track = getTrack?.();
      if (!track?.url) return false;
      return player.toggle(track.url, paint, track);
    };
    paint(false);
    return { refresh: () => paint(player.playing(getTrack?.()?.url)) };
  }

  global.StudioAudioTrigger = Object.freeze({ bind });
})(window);
