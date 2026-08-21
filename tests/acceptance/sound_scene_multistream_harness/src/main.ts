import { SoundScenePlayout } from "@/features/sound-scene/engine/sound-scene-playout"
import type { SoundScene, SoundSceneClip, SoundSceneTrack } from "@/types/domain"

const durationMs = 60 * 60_000
const sourceUrl = new URLSearchParams(location.search).get("fixture") === "mp3"
  ? "./qa-60.mp3" : "./qa-60.wav"
const clip = (id: string): SoundSceneClip => ({
  id, asset_id: 1, duration_ms: durationMs, source_offset_ms: 0,
  gain: .25, fade_in_ms: 0, fade_out_ms: 0, loop: false,
  ducking: false, muted: false, locked: false, effects: [],
  anchor: { kind: "absolute", position_ms: 0 }, filename: sourceUrl,
  source_duration_ms: durationMs, resolved_start_ms: 0,
  resolved_duration_ms: durationMs,
})
const tracks: SoundSceneTrack[] = [
  { id: "music-a", kind: "music", name: "Music A", volume: 1, muted: false, clips: [clip("clip-a")] },
  { id: "music-b", kind: "music", name: "Music B", volume: 1, muted: false, clips: [clip("clip-b")] },
]
const scene: SoundScene = {
  production_id: 1, revision: 1,
  document: { version: 1, sequence_overrides: {}, tracks },
  can_undo: false, can_redo: false, updated_at: new Date().toISOString(),
  resolved: {
    version: 1, signature: "qa-60-minute-three-streams", duration_ms: durationMs,
    sequence_projection: {
      signature: "qa-sequence", duration_ms: durationMs, sample_rate: 48_000,
      spans: [{
        part_id: 1, part_public_id: "qa-part", position: 0, kind: "speech",
        title: "QA Sequence", role: "QA", voice_name: "QA", filename: sourceUrl,
        start_ms: 0, duration_ms: durationMs, silence: false, missing: false,
        mix: { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] },
      }],
    },
    tracks, orphans: [],
  },
  sequence_stem: {
    url: sourceUrl, filename: sourceUrl, duration_ms: durationMs,
    signature: "qa-sequence", cached: true,
  },
}

type InternalStream = { element: HTMLAudioElement; clip?: SoundSceneClip }
type Snapshot = Record<string, unknown>
const playout = new SoundScenePlayout(scene)
// Computer Use can transiently background Safari between actions. Keep this
// focused harness alive so only the explicit Leave control exercises release.
const visibilityListener = (playout as unknown as { visibilityListener: () => void })
  .visibilityListener
document.removeEventListener("visibilitychange", visibilityListener)
const result = document.querySelector<HTMLPreElement>("#result")!
const summary = document.querySelector<HTMLElement>("#summary")!
const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")]
const started = new Map<HTMLAudioElement, number>()
const history: Snapshot[] = []
let requestedAt = 0
let maximumDriftMs = 0
let maximumTimelineOffsetMs = 0
let timer = 0

function streams() {
  return (playout as unknown as { streams: InternalStream[] }).streams
}

function snapshot(label: string) {
  const playhead = Number(playout.currentTime().toFixed(3))
  const rows = streams().map((stream) => ({
    stream: stream.clip?.id || "sequence",
    time: Number(stream.element.currentTime.toFixed(3)),
    paused: stream.element.paused,
    readyState: stream.element.readyState,
    networkState: stream.element.networkState,
    preload: stream.element.preload,
    timelineOffsetMs: Math.round((stream.element.currentTime - playhead) * 1_000),
    onsetMs: started.has(stream.element)
      ? Math.round(started.get(stream.element)! - requestedAt) : null,
  }))
  const activeTimes = rows.filter((row) => !row.paused).map((row) => row.time)
  const driftMs = activeTimes.length > 1
    ? Math.round((Math.max(...activeTimes) - Math.min(...activeTimes)) * 1_000)
    : 0
  maximumDriftMs = Math.max(maximumDriftMs, driftMs)
  const timelineOffsetMs = activeTimes.length
    ? Math.max(...rows.filter((row) => !row.paused)
      .map((row) => Math.abs(row.timelineOffsetMs)))
    : 0
  maximumTimelineOffsetMs = Math.max(maximumTimelineOffsetMs, timelineOffsetMs)
  const entry = {
    label, at: new Date().toISOString(), userAgent: navigator.userAgent,
    playhead, diagnostics: playout.diagnostics(), streams: rows,
    driftMs, maximumDriftMs, timelineOffsetMs, maximumTimelineOffsetMs,
    onsetSpreadMs: started.size > 1
      ? Math.round(Math.max(...started.values()) - Math.min(...started.values())) : null,
  }
  history.push(entry)
  if (history.length > 240) history.shift()
  summary.textContent = `${label}: ${rows.length} streams · onset spread ${entry.onsetSpreadMs ?? "—"} ms · stream drift ${driftMs} ms · timeline offset ${timelineOffsetMs} ms · maxima ${maximumDriftMs}/${maximumTimelineOffsetMs} ms`
  result.textContent = JSON.stringify(entry, null, 2)
  return entry
}

function follow(label: string) {
  window.clearInterval(timer)
  timer = window.setInterval(() => snapshot(label), 100)
}

async function start() {
  await playout.activatePlayout()
  for (const stream of streams()) {
    stream.element.addEventListener("playing", () => {
      if (!started.has(stream.element)) started.set(stream.element, performance.now())
    })
  }
  requestedAt = performance.now()
  started.clear()
  maximumDriftMs = 0
  maximumTimelineOffsetMs = 0
  await playout.play(0)
  follow("playing from beginning")
}
function seek(seconds: number) { playout.seek(seconds); snapshot(`seek ${seconds}s`) }
function pause() { window.clearInterval(timer); playout.pause(); snapshot("paused") }
async function resume() { await playout.play(); follow("resumed") }
function leave() {
  window.clearInterval(timer)
  playout.deactivatePlayout()
  snapshot("left Sound Design")
}

async function boot() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker is unavailable")
  await navigator.serviceWorker.register("./sw.js")
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }))
    location.reload()
    return
  }
  await playout.activatePlayout()
  buttons.forEach((button) => { button.disabled = false })
  snapshot("ready")
}

document.querySelector("#start")!.addEventListener("click", () => void start())
document.querySelector("#forward")!.addEventListener("click", () => seek(50 * 60))
document.querySelector("#pause")!.addEventListener("click", pause)
document.querySelector("#resume")!.addEventListener("click", () => void resume())
document.querySelector("#back")!.addEventListener("click", () => seek(60))
document.querySelector("#leave")!.addEventListener("click", leave)

Object.assign(window, { soundSceneQA: { start, seek, pause, resume, leave, snapshot, history } })
void boot().catch((error: unknown) => {
  result.textContent = error instanceof Error ? error.stack || error.message : String(error)
})
