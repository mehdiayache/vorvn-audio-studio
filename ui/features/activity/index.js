/* Activity owns the durable run ledger UI and its refresh lifecycle. */
(function exposeStudioActivity(global) {
  "use strict";

  function create({ get, api, escapeHtml, voiceLabel, clock, stamp, openAudio }) {
    let timer = null;

    const tookLong = ms => !ms ? ""
      : ms < 1000 ? `${ms} ms`
      : ms < 60000 ? `${(ms / 1000).toFixed(1)} s`
      : `${Math.round(ms / 60000)} min`;

    async function load() {
      const params = new URLSearchParams({ limit: "80" });
      if (get("actFilter").value) params.set("kind", get("actFilter").value);
      if (get("actFailedOnly").checked) params.set("failed", "1");
      const data = await api(`/api/activity?${params}`);
      if (!data || data.total === undefined) return;
      const kinds = data.kinds || {};
      const named = kind => kinds[kind] ||
        (kind === "blocked" ? "Refused by your cap" : kind);

      const live = data.running || [];
      get("runningCard").style.display = live.length ? "" : "none";
      get("runningCount").textContent = live.length || "";
      get("runningList").innerHTML = live.map(run => {
        const share = run.total ? Math.round(run.done / run.total * 100) : 0;
        return `<div class="live-run"><div class="run" style="padding:0">` +
          `<span class="dot"></span><span class="what"><b>${escapeHtml(named(run.kind))}</b>` +
          `${run.detail ? " · " + escapeHtml(run.detail) : ""}` +
          `${run.where ? " · " + escapeHtml(run.where) : ""}</span>` +
          `<span class="took">${run.total ? `${run.done}/${run.total}` : ""} · ` +
          `${tookLong(run.age * 1000)}</span></div>` +
          (run.total ? `<div class="bar"><i style="width:${share}%"></i></div>` : "") +
          `</div>`;
      }).join("");

      get("actHeadline").innerHTML =
        `<div class="stat"><b>$${data.total.toFixed(4)}</b><span>all time</span></div>` +
        `<div class="stat"><b>$${data.month.toFixed(4)}</b><span>this month</span></div>` +
        `<div class="stat"><b>$${data.today.toFixed(4)}</b><span>today</span></div>` +
        `<div class="stat"><b>${data.runs}</b><span>runs</span></div>` +
        (data.problems ? `<div class="stat"><b style="color:var(--bad)">${data.problems}</b>` +
          `<span>didn't work</span></div>` : "");

      const most = Math.max(...(data.by_kind || []).map(item => item.cost), 0.000001);
      get("actByKind").innerHTML = (data.by_kind || []).map(item =>
        `<div class="kind-row"><span class="nm">${escapeHtml(named(item.kind))}</span>` +
        `<span class="bar" style="width:${Math.max(3, item.cost / most * 55)}%"></span>` +
        `<span class="amt">$${item.cost.toFixed(4)} · ${item.runs}` +
        `${item.problems ? ` · <b style="color:var(--bad)">${item.problems} failed</b>` : ""}` +
        `</span></div>`).join("") || '<p class="hint" style="margin:0">Nothing yet.</p>';

      const days = data.by_day || [];
      const biggest = Math.max(...days.map(day => day.cost), 0.000001);
      get("actByDay").innerHTML = days.length ? days.map(day =>
        `<div class="day-row"><span class="d">${day.day}</span>` +
        `<span class="bar" style="width:${Math.max(3, day.cost / biggest * 60)}%"></span>` +
        `<span class="amt">$${day.cost.toFixed(4)} · ${day.runs} run${day.runs === 1 ? "" : "s"}` +
        `</span></div>`).join("") :
        '<p class="hint" style="margin:0">Nothing in the last 30 days.</p>';

      const chosen = get("actFilter").value;
      get("actFilter").innerHTML = `<option value="">Everything</option>` +
        (data.by_kind || []).map(item =>
          `<option value="${item.kind}">${escapeHtml(named(item.kind))} (${item.runs})</option>`
        ).join("");
      get("actFilter").value = chosen;

      const rows = data.runs_list || [];
      get("actRuns").innerHTML = rows.length ? rows.map(run => {
        const bad = run.status !== "ok" && run.status !== "running";
        const what = [named(run.kind), run.detail,
          run.voice ? voiceLabel(run.voice) : "", run.where].filter(Boolean).join(" · ");
        const usage = run.usage || {};
        const tokenNote = run.cost_basis === "actual tokens"
          ? `${usage.input_text || 0} input text · ${usage.output_text || 0} output text · ` +
            `${usage.output_audio || 0} output audio tokens`
          : "Estimated before sending";
        const audioTime = run.seconds ? `${clock(run.seconds)} audio` : "";
        const renderTime = tookLong(run.elapsed_ms);
        const realtime = run.seconds && run.elapsed_ms
          ? `${(run.elapsed_ms / 1000 / run.seconds).toFixed(1)}× realtime` : "";
        const timing = [audioTime, renderTime, realtime].filter(Boolean).join(" · ");
        return `<div class="run${bad ? " bad" : ""}${run.status === "running" ? " live" : ""}` +
          `${run.children ? " open-able" : ""}" data-run="${run.id}" ` +
          `${run.children ? `data-children="${run.children}"` : ""} ` +
          `title="${escapeHtml(run.error || run.model || "")}"><span class="dot"></span>` +
          `<span class="when">${stamp(run.when)}</span><span class="what">${escapeHtml(what)}` +
          `${run.children ? ` · ${run.children} inside` : ""}` +
          `${bad ? ` — ${escapeHtml(run.status)}` : ""}</span>` +
          (run.generation_id ? `<span class="made" data-open="${run.generation_id}">open ›</span>` : "") +
          `<span class="took">${timing}</span><span class="price" title="${escapeHtml(tokenNote)}">` +
          `${run.cost ? `$${run.cost.toFixed(4)}` : "—"}` +
          `<small>${run.cost_basis === "actual tokens" ? "actual" : "estimate"}</small></span></div>`;
      }).join("") : '<p class="hint" style="margin:0">Nothing matches.</p>';

      get("actRuns").querySelectorAll("[data-open]").forEach(link => link.onclick = event => {
        event.stopPropagation();
        openAudio(Number(link.dataset.open));
      });
      get("actRuns").querySelectorAll("[data-children]").forEach(row => row.onclick = async () => {
        const already = row.nextElementSibling;
        if (already && already.classList.contains("run-children")) return already.remove();
        const response = await api(`/api/activity/children?id=${row.dataset.run}`);
        const box = document.createElement("div");
        box.className = "run-children";
        box.innerHTML = (response.children || []).map(child =>
          `<div class="run${child.status !== "ok" ? " bad" : ""}">` +
          `<span class="dot"></span><span class="when">${stamp(child.when)}</span>` +
          `<span class="what">${escapeHtml([child.detail,
            child.voice ? voiceLabel(child.voice) : ""].filter(Boolean).join(" · "))}` +
          `${child.error ? " — " + escapeHtml(child.error) : ""}</span>` +
          `<span class="took">${tookLong(child.elapsed_ms)}</span>` +
          `<span class="price">${child.cost ? `$${child.cost.toFixed(4)}` : "—"}</span></div>`
        ).join("");
        row.insertAdjacentElement("afterend", box);
      });
    }

    async function loadSpend() {
      const data = await api("/api/activity?limit=1");
      get("spendLedger").innerHTML = data && data.total !== undefined
        ? `Today <b>$${data.today.toFixed(4)}</b> · This month ` +
          `<b>$${data.month.toFixed(4)}</b> · All time <b>$${data.total.toFixed(4)}</b> ` +
          `over ${data.runs} runs`
        : "Needs the history database to track spending.";
    }

    function start() {
      stop();
      load();
      timer = setInterval(load, 3000);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    get("actFilter").addEventListener("change", load);
    get("actFailedOnly").addEventListener("change", load);
    return Object.freeze({ load, loadSpend, start, stop });
  }

  global.StudioActivity = Object.freeze({ create });
})(window);
