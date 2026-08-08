/* Voice-clone reference capture: passage, microphone, upload and local review. */
(function exposeVoiceCloneRecorder(global) {
  "use strict";

  function create({ get, setStatus, player, audioTrigger, fileDrop }) {
    const $ = get;
    const passages = {
      ar: [
        ["متوازن — الخيار الأفضل عمومًا", "دعني أفكر في هذا الأمر بهدوء. الصباح هنا يبدأ ببطء، والشارع لا يستيقظ قبل السابعة. كنت أظن أن الأمر سيكون أصعب من ذلك، لكن ها نحن. قبل سنوات قليلة كنت سأضحك من الفكرة نفسها. واليوم؟ صار أمرًا عاديًا. حسنًا، هل نبدأ الآن، أم تفضّل أن ننتظر حتى الغد؟"],
        ["هادئ ودافئ — للسرد والقراءة", "هناك سكون خاص يسبق الفجر، لا يشبه أي وقت آخر. يهدأ البيت، ولا تكون السيارات قد بدأت بعد، وكل شيء ينتظر في صمت. لطالما أحببت تلك الساعة. تستطيع أن تسمع أفكارك فيها. فنجان قهوة، ودفتر، ولا أحد يطلب منك شيئًا بعد. لا تدوم طويلًا بالطبع، لكنها ما دامت، تكون كاملة."],
      ],
      fr: [
        ["Équilibré — le meilleur choix général", "Bon, laisse-moi y réfléchir correctement. Le matin commence lentement ici, et la rue ne se réveille pas avant sept heures. Honnêtement ? Je n'étais pas sûr que ça marcherait au début — et pourtant nous y voilà. Il y a six ou sept ans, j'aurais ri de l'idée. Maintenant ? C'est devenu banal. Alors, on commence, ou tu préfères attendre demain ?"],
        ["Calme et chaleureux — pour la narration", "Il y a un silence particulier qui n'arrive que juste avant l'aube. La maison se pose, la circulation n'a pas commencé, et pendant quelques minutes tout attend simplement. J'ai toujours aimé cette heure-là. On s'entend penser. Un café, un carnet, et personne qui te demande quoi que ce soit. Ça ne dure jamais longtemps — mais tant que ça dure, c'est parfait."],
      ],
      default: [
        ["Balanced — best all-round choice", "Right, let me think about this properly. The quick brown fox jumps over the lazy dog, which is exactly the sort of thing you'd expect. Honestly? I wasn't sure it would work at first — but here we are. Six or seven years ago I'd have laughed at the idea. Now? It's just Tuesday. Anyway, shall we get started, or would you rather wait until morning?"],
        ["Warm and calm — for narration", "There's a particular kind of quiet that only happens just before dawn. The house settles, the traffic hasn't started, and for a few minutes everything simply waits. I've always liked that hour. You can hear yourself think. Coffee, a notebook, and nobody asking anything of you yet. It never lasts long, of course — but while it does, it's perfect."],
        ["Lively — for adverts and social", "Okay, so — this is genuinely exciting, and I'm not just saying that! Three years of work, and it finally launches on Thursday. Thursday! Can you believe it? We've tested everything twice, argued about the colours far too much, and somehow it all came together. Honestly, I can't wait for you to see it. Right, enough talking — let's go."],
        ["Measured — for business and explainers", "Let's look at what actually happened. Revenue grew by roughly twelve percent, which is solid, though slightly behind where we'd hoped. The interesting part isn't the number itself — it's where it came from. Almost half of that growth was repeat customers. That tells us something worth paying attention to. So the question becomes: how do we build on it?"],
      ],
    };
    let passageIndex = 0;
    let recorder = null;
    let chunks = [];
    let timer = null;
    let blob = null;
    let previewUrl = "";
    let seconds = 0;
    let startedAt = 0;

    function showPassage() {
      const code = $("cloneLang").value;
      const set = passages[code] || passages.default;
      const [label, text] = set[passageIndex % set.length];
      $("cloneScript").textContent = text;
      const rtl = code === "ar";
      $("cloneScript").dir = rtl ? "rtl" : "ltr";
      $("cloneScript").style.textAlign = rtl ? "right" : "";
      const duration = Math.round(text.split(/\s+/).length / 150 * 60);
      const note = `${label} · about ${duration} seconds · read it naturally, don't perform it`;
      $("cloneScriptNote").textContent = code && !passages[code]
        ? `${note} — no passage written in this language yet, so read something of your own in it instead`
        : note;
    }

    function updateSteps() {
      const haveAudio = !!$("cloneUrl").value.trim();
      const omni = $("cloneEngine").value === "omni";
      const haveName = (omni ? /^[a-z0-9_]{1,16}$/ : /^[a-z0-9]{1,9}$/)
        .test($("clonePrefix").value.trim());
      $("step1").classList.toggle("active", !haveAudio);
      $("step2").classList.toggle("active", haveAudio && !haveName);
      $("step3").classList.toggle("active", haveAudio && haveName);
      $("cloneGo").disabled = !(haveAudio && haveName);
      const name = $("clonePrefix").value.trim();
      const hint = $("prefixHint");
      if (!name) {
        hint.textContent = omni ? "lowercase letters, numbers or underscores, max 16"
          : "lowercase letters and numbers only, max 9";
        hint.style.color = "var(--muted)";
      } else if (!haveName) {
        hint.textContent = "lowercase letters and numbers only — no spaces or symbols";
        hint.style.color = "var(--bad)";
      } else {
        hint.textContent = `✓ ${name}`;
        hint.style.color = "var(--good)";
      }
    }

    function stop() {
      clearInterval(timer);
      if (startedAt) seconds = (Date.now() - startedAt) / 1000;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorder = null;
      $("recordBtn").textContent = "● Start recording";
    }

    async function start() {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (_) {
        return setStatus("cloneStatus", "Couldn't reach the microphone — allow access in your browser, then retry.", "err");
      }
      chunks = [];
      $("recordKeep").disabled = false;
      $("recordKeep").textContent = "Use this recording";
      const mediaRecorder = new MediaRecorder(stream);
      recorder = mediaRecorder;
      mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        blob = new Blob(chunks, { type: mediaRecorder.mimeType });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        $("recordReview").style.display = "";
        const usable = seconds >= 3 && blob.size > 0;
        $("recordMeta").innerHTML = `${seconds.toFixed(1)} seconds · ${(blob.size / 1000).toFixed(0)} KB` +
          (usable ? "" : ' · <span style="color:var(--bad)">too short to clone, record at least 3 seconds</span>');
        $("recordKeep").disabled = !usable;
        setStatus("cloneStatus", "Have a listen, then keep it or record again.", "");
      };
      mediaRecorder.start();
      startedAt = Date.now();
      seconds = 0;
      timer = setInterval(() => {
        seconds = (Date.now() - startedAt) / 1000;
        $("recordTime").textContent = `${seconds.toFixed(1)}s`;
        $("recordTime").style.color = seconds < 3 ? "var(--warn)"
          : seconds > 30 ? "var(--bad)" : "var(--good)";
        if (seconds >= 30) stop();
      }, 100);
      $("recordBtn").textContent = "■ Stop";
      setStatus("cloneStatus", "Recording — speak naturally for at least 3 seconds.", "busy");
    }

    function discard() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (player.url === previewUrl) player.stop({ reset: true });
      previewUrl = "";
      blob = null;
      chunks = [];
      seconds = 0;
      startedAt = 0;
      $("recordReview").style.display = "none";
      $("recordTime").textContent = "not recording";
      $("recordTime").style.color = "";
    }

    async function uploadBlob() {
      if (!blob?.size) return setStatus("cloneStatus", "Nothing was captured — try recording again.", "err");
      setStatus("cloneStatus", "Uploading your recording…", "busy");
      const response = await fetch("/api/clone/upload", { method: "POST",
        headers: { "X-Filename": encodeURIComponent("recording.webm") }, body: blob })
        .then(result => result.json());
      if (response.error) return setStatus("cloneStatus", response.error, "err");
      $("cloneUrl").value = response.url;
      $("cloneUrl").dataset.referenceId = response.reference_id || "";
      updateSteps();
      $("recordKeep").disabled = true;
      $("recordKeep").textContent = "Uploaded ✓";
      setStatus("cloneStatus", "Recording uploaded. Name the voice and create it.", "ok");
    }

    $("scriptSwap").onclick = event => { event.preventDefault(); passageIndex++; showPassage(); };
    $("cloneLang").onchange = showPassage;
    $("recordBtn").onclick = () => recorder ? stop() : start();
    audioTrigger.bind({ button: $("recordPreviewPlay"), player,
      getTrack: () => previewUrl ? { url: previewUrl, name: "voice-recording.webm",
        title: "Voice-clone recording", meta: `${seconds.toFixed(1)} seconds · local preview` } : null,
      idleLabel: "Listen to this recording", playingLabel: "Pause this recording" });
    $("recordKeep").onclick = uploadBlob;
    $("recordDiscard").onclick = () => { discard(); setStatus("cloneStatus", "Discarded. Nothing was uploaded.", ""); };
    $("recordRedo").onclick = () => { discard(); start(); };
    $("uploadBtn").onclick = async () => {
      const file = $("cloneFile").files[0];
      if (!file) return setStatus("cloneStatus", "Pick an audio file first.", "err");
      setStatus("cloneStatus", "Uploading…", "busy");
      const response = await fetch("/api/clone/upload", { method: "POST",
        headers: { "X-Filename": encodeURIComponent(file.name) }, body: file })
        .then(result => result.json());
      if (response.error) return setStatus("cloneStatus", response.error, "err");
      $("cloneUrl").value = response.url;
      $("cloneUrl").dataset.referenceId = response.reference_id || "";
      updateSteps();
      setStatus("cloneStatus", "Uploaded. Now name the voice in step 2.", "ok");
    };
    fileDrop.bind({ target: $("cloneFileDrop"), input: $("cloneFile"), onFiles: files => {
      const file = files[0];
      if (file) setStatus("cloneStatus", `${file.name} is ready. Click Upload this file to continue.`, "ok");
    }});
    return Object.freeze({ showPassage, updateSteps, discard });
  }

  global.StudioVoiceCloneRecorder = Object.freeze({ create });
})(window);
