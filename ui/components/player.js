/* Shared studio player.
   Every feature supplies a Track; this component alone owns the audio element,
   transport, waveform, keyboard controls, renderer lifecycle and player DOM. */
(function exposeStudioPlayer(global) {
  "use strict";

  const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

  function create({ elements, renderVoice, renderIcon, formatTime, stopSequence }) {
    const el = elements;
    const audio = el.audio;
    const wave = { peaks: null, forUrl: null, request: 0, cache: new Map() };
    let render = null;
    let afterEnd = null;

    const player = {
      url: null,
      track: null,
      loadVersion: 0,
      get audio() { return audio; },

      releaseRenderer() {
        if (!render) return;
        try { render(false); } catch (_) {}
        render = null;
      },

      show(track) {
        el.root.dataset.state = track?.url ? "ready" : "empty";
        el.title.textContent = track?.title || track?.name || "Nothing loaded";
        el.meta.textContent = track?.meta || (track?.url ? "Ready" : "Choose a generation");
        el.avatar.innerHTML = track?.voice
          ? renderVoice(track.voice)
          : '<span class="voice-face" style="width:34px;height:34px;font-size:13px">♪</span>';
        const downloadable = !!track?.url && track.downloadable !== false;
        el.download.href = downloadable ? track.url : "";
        el.download.setAttribute("download", track?.name || "audio");
        el.download.style.pointerEvents = downloadable ? "" : "none";
        el.download.style.opacity = downloadable ? "" : ".45";
        el.download.title = track?.path ? `Saved to ${track.path}` : "Download audio";
        el.savedPath.textContent = track?.path ? `Saved to ${track.path}` : "";
      },

      mount(host) {
        if (!host) return;
        host.appendChild(el.root);
        el.root.classList.add("in-context");
        drawWave(this.url || "");
      },

      home() {
        el.home.after(el.root);
        el.root.classList.remove("in-context");
        drawWave(this.url || "");
      },

      load(track, { render: nextRender = null, autoplay = true, onEnded = null,
                     keepSequence = false } = {}) {
        if (!track?.url) return false;
        if (!keepSequence) stopSequence?.();
        audio.pause();
        this.releaseRenderer();
        afterEnd = onEnded;
        this.track = { ...track };
        this.url = track.url;
        render = nextRender;
        this.loadVersion += 1;
        this.show(this.track);
        audio.src = track.url;
        audio.load();
        drawWave(this.url);
        if (autoplay) audio.play().catch(() => {
          el.root.dataset.state = "error";
          this.releaseRenderer();
        });
        return true;
      },

      stop({ reset = false } = {}) {
        audio.pause();
        if (reset && isFinite(audio.duration)) audio.currentTime = 0;
        this.releaseRenderer();
        afterEnd = null;
        stopSequence?.();
      },

      toggle(url, nextRender, details = {}) {
        if (this.url === url) {
          if (nextRender && nextRender !== render) {
            if (render) try { render(false); } catch (_) {}
            render = nextRender;
          }
          if (!audio.paused) {
            audio.pause();
            return false;
          }
          if (audio.ended || (isFinite(audio.duration) &&
              audio.currentTime >= audio.duration - .05)) audio.currentTime = 0;
          audio.play().catch(() => {
            el.root.dataset.state = "error";
            if (render) try { render(false); } catch (_) {}
          });
          return true;
        }
        return this.load({
          url,
          name: details.name || "preview",
          title: details.title || "Voice preview",
          meta: details.meta || "Preview",
          voice: details.voice || "",
          ...details,
        }, { render: nextRender });
      },

      playAndWait(track) {
        return new Promise(resolve => this.load(track, { onEnded: resolve }));
      },

      seek(track, seconds) {
        const start = () => {
          audio.currentTime = Math.max(0, Number(seconds) || 0);
          audio.play().catch(() => {});
        };
        if (this.url !== track.url) {
          this.load(track, { autoplay: false });
          audio.addEventListener("loadedmetadata", start, { once: true });
        } else {
          start();
        }
      },

      finish() {
        this.releaseRenderer();
        const done = afterEnd;
        afterEnd = null;
        if (done) done();
      },

      playing(url) { return this.url === url && !audio.paused; },
      redraw() { drawWave(this.url || ""); },
    };

    async function readWavePeaks(url) {
      if (wave.cache.has(url)) return wave.cache.get(url);
      let peaks = null;
      let context = null;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`waveform ${response.status}`);
        const bytes = await response.arrayBuffer();
        context = new AudioContext();
        const sound = await context.decodeAudioData(bytes);
        const data = sound.getChannelData(0);
        const buckets = 320;
        const step = Math.floor(data.length / buckets) || 1;
        const raw = [];
        for (let i = 0; i < buckets; i++) {
          let loudest = 0;
          for (let j = i * step; j < (i + 1) * step && j < data.length; j += 4)
            loudest = Math.max(loudest, Math.abs(data[j]));
          raw.push(loudest);
        }
        const ceiling = Math.max(...raw, 0.01);
        peaks = raw.map(value => value / ceiling);
      } catch (_) {
        peaks = null;
      } finally {
        if (context) context.close().catch(() => {});
      }
      wave.cache.set(url, peaks);
      return peaks;
    }

    async function drawWave(url) {
      const canvas = el.wave;
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const ratio = global.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const pen = canvas.getContext("2d");
      pen.setTransform(ratio, 0, 0, ratio, 0, 0);
      pen.clearRect(0, 0, width, height);

      if (wave.forUrl !== url) {
        wave.peaks = null;
        wave.forUrl = url;
        const request = ++wave.request;
        if (url && player.track?.waveform !== false) {
          const peaks = await readWavePeaks(url);
          if (request === wave.request && wave.forUrl === url) {
            wave.peaks = peaks;
            drawWave(url);
          }
        }
      }

      const played = audio.duration ? audio.currentTime / audio.duration : 0;
      const bars = wave.peaks || [];
      const style = getComputedStyle(document.documentElement);
      const done = style.getPropertyValue("--accent").trim() || "#5b4bd6";
      const todo = style.getPropertyValue("--line").trim() || "#ddd";
      const barWidth = width / (bars.length || 1);
      bars.forEach((level, i) => {
        const tall = Math.max(2, level * (height - 6));
        pen.fillStyle = (i / bars.length) <= played ? done : todo;
        pen.fillRect(i * barWidth, (height - tall) / 2, Math.max(1, barWidth - 1), tall);
      });
      if (!bars.length && url) {
        pen.fillStyle = todo;
        pen.fillRect(0, height / 2 - 1, width * played, 2);
      }
    }

    function drawPlayState() {
      el.playPause.innerHTML = renderIcon(audio.paused ? "play" : "pause");
      el.playPause.title = audio.paused ? "Play — or press space" : "Pause — or press space";
      el.clock.textContent = formatTime(audio.currentTime || 0);
      el.total.textContent = isFinite(audio.duration) ? formatTime(audio.duration) : "0:00";
    }

    el.playPause.onclick = () => {
      if (!player.url) return;
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
    };
    el.wave.onclick = event => {
      if (!isFinite(audio.duration)) return;
      const box = el.wave.getBoundingClientRect();
      audio.currentTime = ((event.clientX - box.left) / box.width) * audio.duration;
    };
    el.speed.onclick = () => {
      const next = SPEEDS[(SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length] || 1;
      audio.playbackRate = next;
      el.speed.textContent = `${next}×`;
    };

    audio.addEventListener("play", () => {
      el.root.dataset.state = "playing";
      if (render) try { render(true); } catch (_) {}
    });
    audio.addEventListener("pause", () => {
      if (player.track) el.root.dataset.state = "ready";
      if (render) try { render(false); } catch (_) {}
    });
    audio.addEventListener("ended", () => player.finish());
    audio.addEventListener("error", () => {
      el.root.dataset.state = "error";
      player.finish();
    });
    for (const event of ["play", "pause", "timeupdate", "loadedmetadata", "ended"]) {
      audio.addEventListener(event, () => {
        drawPlayState();
        if (event !== "timeupdate" || !audio.paused) drawWave(player.url || "");
      });
    }
    audio.addEventListener("loadeddata", () => drawWave(player.url || ""));
    global.addEventListener("resize", () => drawWave(player.url || ""));
    document.addEventListener("keydown", event => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)
        || document.activeElement?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || !player.url) return;
      if (event.key === " ") { event.preventDefault(); el.playPause.click(); }
      else if (event.key === "ArrowLeft") audio.currentTime -= 5;
      else if (event.key === "ArrowRight") audio.currentTime += 5;
      else if (event.key.toLowerCase() === "s") el.speed.click();
    });

    // Markup already contains the empty 0:00 state. Do not call injected
    // formatters during construction: app composition may define them later in
    // the same classic script. The first media event paints the live state.
    return player;
  }

  global.StudioPlayer = Object.freeze({ create });
})(window);
