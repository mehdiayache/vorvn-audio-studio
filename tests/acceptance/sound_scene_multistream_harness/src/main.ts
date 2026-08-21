import { SoundScenePlayout } from "@/features/sound-scene/engine/sound-scene-playout"
import type { SoundScene, SoundSceneClip, SoundSceneTrack } from "@/types/domain"

const durationMs = 60 * 60_000
const query = new URLSearchParams(location.search)
const hybrid = query.get("mode") === "hybrid"
const sourceUrl = query.get("fixture") === "flac"
  ? "./qa-60.flac"
  : query.get("fixture") === "mp3" ? "./qa-60.mp3" : "./qa-60.wav"
const longClip = (id: string): SoundSceneClip => ({
  id, asset_id: 1, duration_ms: durationMs, source_offset_ms: 0,
  gain: .25, fade_in_ms: 0, fade_out_ms: 0, loop: false,
  ducking: false, muted: false, locked: false, effects: [],
  anchor: { kind: "absolute", position_ms: 0 }, filename: sourceUrl,
  source_duration_ms: durationMs, resolved_start_ms: 0,
  resolved_duration_ms: durationMs,
})
const cueClip = (id: string, positionMs: number): SoundSceneClip => ({
  id, asset_id: positionMs, duration_ms: 120, source_offset_ms: 0,
  gain: 1, fade_in_ms: 0, fade_out_ms: 0, loop: false,
  ducking: false, muted: false, locked: false, effects: [],
  anchor: { kind: "absolute", position_ms: positionMs }, filename: "./qa-cue.wav",
  source_duration_ms: 120, resolved_start_ms: positionMs, resolved_duration_ms: 120,
})
const cuePositions = [60, 20 * 60, 50 * 60]
const tracks: SoundSceneTrack[] = [
  { id: "music-a", kind: "music", name: "Music A", volume: 1, muted: false, clips: [longClip("clip-a")] },
  ...(hybrid ? [{
    id: "precision-cues", kind: "music" as const, name: "Precision cues",
    volume: 1, muted: false,
    clips: cuePositions.map((seconds, index) => cueClip(`cue-${index}`, seconds * 1_000)),
  }] : [{
    id: "music-b", kind: "music" as const, name: "Music B", volume: 1,
    muted: false, clips: [longClip("clip-b")],
  }]),
]
const scene: SoundScene = {
  production_id: 1, revision: 1,
  document: { version: 1, sequence_overrides: {}, tracks },
  can_undo: false, can_redo: false, updated_at: new Date().toISOString(),
  resolved: {
    version: 1, signature: hybrid ? "qa-60-minute-hybrid" : "qa-60-minute-three-streams",
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
type HybridMeasurement = {
  cueAt: number
  sequenceOnset: number
  bufferedOnset: number
  driftMs: number
}
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
const hybridMeasurements: HybridMeasurement[] = []
let requestedAt = 0
let maximumDriftMs = 0
let maximumTimelineOffsetMs = 0
let timer = 0
let signalProbe: ScriptProcessorNode | null = null
let armedCue: { at: number; sequenceOnset: number | null; bufferedOnset: number | null } | null = null
let hybridPeak = { sequenceLevel: 0, bufferedLevel: 0 }

function toneLevel(samples: Float32Array, frequency: number, sampleRate: number) {
  let real = 0
  let imaginary = 0
  for (let index = 0; index < samples.length; index += 1) {
    const angle = 2 * Math.PI * frequency * index / sampleRate
    real += samples[index]! * Math.cos(angle)
    imaginary -= samples[index]! * Math.sin(angle)
  }
  return 2 * Math.hypot(real, imaginary) / samples.length
}

function monitorHybrid(event: AudioProcessingEvent) {
  if (!event.inputBuffer.numberOfChannels) return
  for (let channel = 0; channel < event.outputBuffer.numberOfChannels; channel += 1) {
    const input = event.inputBuffer.getChannelData(Math.min(channel, event.inputBuffer.numberOfChannels - 1))
    event.outputBuffer.copyToChannel(input, channel)
  }
  if (!armedCue) return
  const input = event.inputBuffer.getChannelData(0)
  const chunkSize = 128
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    const chunk = input.subarray(offset, Math.min(input.length, offset + chunkSize))
    const sequenceLevel = toneLevel(chunk, 880, event.inputBuffer.sampleRate)
    const bufferedLevel = toneLevel(chunk, 1760, event.inputBuffer.sampleRate)
    hybridPeak.sequenceLevel = Math.max(hybridPeak.sequenceLevel, sequenceLevel)
    hybridPeak.bufferedLevel = Math.max(hybridPeak.bufferedLevel, bufferedLevel)
    const at = event.playbackTime + offset / event.inputBuffer.sampleRate
    if (armedCue.sequenceOnset === null && sequenceLevel > .08)
      armedCue.sequenceOnset = at
    if (armedCue.bufferedOnset === null && bufferedLevel > .04)
      armedCue.bufferedOnset = at
    if (armedCue.sequenceOnset !== null && armedCue.bufferedOnset !== null) {
      hybridMeasurements.push({
        cueAt: armedCue.at,
        sequenceOnset: armedCue.sequenceOnset,
        bufferedOnset: armedCue.bufferedOnset,
        driftMs: Math.round(Math.abs(armedCue.bufferedOnset - armedCue.sequenceOnset) * 1_000),
      })
      armedCue = null
      break
    }
  }
}

function armHybridCue(at: number) {
  if (!hybrid) return
  armedCue = { at, sequenceOnset: null, bufferedOnset: null }
  hybridPeak = { sequenceLevel: 0, bufferedLevel: 0 }
}

function installHybridMonitor() {
  if (!hybrid || signalProbe) return
  const internals = playout as unknown as {
    context: AudioContext
    audibleMaster: GainNode
  }
  // Safari's AnalyserNode can report an empty signal for MediaElement sources.
  // This acceptance-only probe inspects the one audible path in real audio
  // callbacks and copies every sample unchanged to the destination.
  signalProbe = internals.context.createScriptProcessor(1024, 2, 2)
  signalProbe.onaudioprocess = monitorHybrid
  internals.audibleMaster.disconnect()
  internals.audibleMaster.connect(signalProbe)
  signalProbe.connect(internals.context.destination)
}

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
    hybridMeasurements: [...hybridMeasurements],
    hybridArmedCue: armedCue ? { ...armedCue } : null,
    hybridPeak,
    maximumHybridDriftMs: hybridMeasurements.length
      ? Math.max(...hybridMeasurements.map((measurement) => measurement.driftMs)) : null,
    onsetSpreadMs: started.size > 1
      ? Math.round(Math.max(...started.values()) - Math.min(...started.values())) : null,
  }
  history.push(entry)
  if (history.length > 240) history.shift()
  const hybridSummary = hybrid
    ? ` · hybrid ${hybridMeasurements.map((measurement) => `${measurement.cueAt / 60}m:${measurement.driftMs}ms`).join(" · ") || `waiting (${hybridPeak.sequenceLevel.toFixed(3)} / ${hybridPeak.bufferedLevel.toFixed(3)})`}`
    : ""
  summary.textContent = `${label}: ${rows.length} streams · onset spread ${entry.onsetSpreadMs ?? "—"} ms · stream drift ${driftMs} ms · timeline offset ${timelineOffsetMs} ms · maxima ${maximumDriftMs}/${maximumTimelineOffsetMs} ms${hybridSummary}`
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
  hybridMeasurements.length = 0
  const startAt = hybrid ? 59.5 : 0
  armHybridCue(60)
  await playout.play(startAt)
  follow(hybrid ? "playing near 1:00 cue" : "playing from beginning")
}
function seek(seconds: number) {
  armHybridCue(seconds)
  playout.seek(hybrid ? seconds - .5 : seconds)
  snapshot(`seek ${seconds}s`)
}
function pause() { window.clearInterval(timer); playout.pause(); snapshot("paused") }
async function resume() { await playout.play(); follow("resumed") }
function leave() {
  window.clearInterval(timer)
  signalProbe?.disconnect()
  signalProbe = null
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
  installHybridMonitor()
  if (hybrid) {
    document.querySelector("h1")!.textContent = "Sound Scene 60-minute hybrid clock acceptance"
    document.querySelector("p")!.textContent = "Sequence Stream + long Music Stream + short buffered precision cues at 1, 20 and 50 minutes."
    document.querySelector("#start")!.textContent = "Play near 1:00"
    document.querySelector("#middle")!.textContent = "Seek near 20:00"
    document.querySelector("#forward")!.textContent = "Seek near 50:00"
    document.querySelector("#back")!.textContent = "Seek back near 1:00"
  }
  buttons.forEach((button) => { button.disabled = false })
  snapshot("ready")
}

document.querySelector("#start")!.addEventListener("click", () => void start())
document.querySelector("#middle")!.addEventListener("click", () => seek(20 * 60))
document.querySelector("#forward")!.addEventListener("click", () => seek(50 * 60))
document.querySelector("#pause")!.addEventListener("click", pause)
document.querySelector("#resume")!.addEventListener("click", () => void resume())
document.querySelector("#back")!.addEventListener("click", () => seek(60))
document.querySelector("#leave")!.addEventListener("click", leave)

Object.assign(window, { soundSceneQA: { start, seek, pause, resume, leave, snapshot, history } })
void boot().catch((error: unknown) => {
  result.textContent = error instanceof Error ? error.stack || error.message : String(error)
})
