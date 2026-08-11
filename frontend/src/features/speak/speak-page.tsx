import { Mic2, Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { AudioPlayerDock } from "@/components/audio-player-dock"
import { RecordingTakeCard, type RecordingTakeView } from "@/components/recording-take-card"
import { SpeechTool } from "@/components/production-tools/speech-tool"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { resolveVoice } from "@/lib/voice"
import type { DurableJob, GeneratePayload, GenerateResult, RecordingAttempt, RecordingSession, VoiceDirectory } from "@/types/domain"
import { belongsToRecordingSession } from "./speak-execution"

import "@/components/production-tools/production-tools.css"
import "./speak-page.css"

type SpeakExecution = { jobId: string; sessionId: string; payload: GeneratePayload }

function requestCapabilityName(payload: GeneratePayload, directory: VoiceDirectory) {
  const route = directory.registry?.bindings.find((item) =>
    Boolean(payload.binding_id && item.binding_id === payload.binding_id)
    || Boolean(payload.catalogue_voice_id && item.catalogue_voice_id === payload.catalogue_voice_id))
  const capabilities = route?.capabilities || []
  const capability = payload.capability_id
    ? capabilities.find((item) => item.id === payload.capability_id)
    : capabilities.length === 1 ? capabilities[0] : null
  return capability?.name || payload.capability_id || "Recording capability"
}

function PendingSpeakExecution({ execution, directory, onTerminal }: {
  execution: SpeakExecution
  directory: ReturnType<typeof useVoiceDirectory>["directory"]
  onTerminal: (execution: SpeakExecution, job: DurableJob<GenerateResult>) => void
}) {
  const job = useJobExecution<GenerateResult>(execution.jobId)
  const reported = useRef(false)
  const terminal = job && ["ok", "warning", "blocked", "failed", "lost", "cancelled"].includes(job.status)
  useEffect(() => {
    if (!job || !terminal || reported.current) return
    reported.current = true
    onTerminal(execution, job)
  }, [execution, job, onTerminal, terminal])
  const status = job && ["failed", "lost", "cancelled"].includes(job.status) ? "failed" : job?.status === "warning" ? "warning" : "pending"
  return <RecordingTakeCard take={{
    id: execution.jobId,
    status,
    voice: execution.payload.voice,
    voiceIdentityId: execution.payload.voice_identity_id,
    language: execution.payload.language,
    method: requestCapabilityName(execution.payload, directory),
    engine: execution.payload.engine,
    model: execution.payload.model,
    script: execution.payload.text,
    message: job?.error || job?.detail,
  }} directory={directory} />
}

export function SpeakPage() {
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const [sessionId, setSessionId] = useState(() => {
    const current = new URLSearchParams(window.location.search).get("session")
    return current && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(current) ? current : crypto.randomUUID()
  })
  const [session, setSession] = useState<RecordingSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [executions, setExecutions] = useState<SpeakExecution[]>([])
  const sessionIdRef = useRef(sessionId)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  const refreshSession = useCallback(async (id = sessionId) => {
    setSessionLoading(true)
    try { setSession(await studioApi.recordingSession(id)) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Could not load this recording session.") }
    finally { setSessionLoading(false) }
  }, [sessionId])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set("session", sessionId)
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    void refreshSession(sessionId)
  }, [refreshSession, sessionId])

  async function generate(payload: GeneratePayload): Promise<DurableJob<GenerateResult>> {
    const request = { ...payload, session_id: sessionId }
    try {
      const job = await studioApi.enqueueGenerate(request)
      setExecutions((current) => [...current, { jobId: job.id, sessionId, payload: request }])
      return job
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Generation failed.")
      throw reason
    }
  }

  const settleExecution = useCallback(async (execution: SpeakExecution, job: DurableJob<GenerateResult>) => {
    // A durable Job keeps running globally, but a result from an abandoned
    // session must never mutate or start playback in the current session.
    if (!belongsToRecordingSession(execution.sessionId, sessionIdRef.current)) return
    try {
      if (job.status === "ok" || job.status === "warning") {
        const result = playableGenerateResult(job.result)
        const name = resolveVoice(execution.payload.voice, voices.directory, execution.payload.voice_identity_id).name
        await player.toggleSource({ key: `job:${job.id}`, url: result.url, title: "Generated recording", subtitle: `${name} · ${result.cost_basis || "estimated cost"}`, kind: "part" })
        if (result.warning) toast.warning(result.warning)
        else toast.success(`Audio ready${result.cost !== undefined ? ` · $${result.cost.toFixed(4)}` : ""}`)
      } else if (job.status === "blocked") {
        toast.warning(job.detail || "This generation needs review before it can continue.")
      } else {
        toast.error(job.error || "Generation failed.")
      }
      await refreshSession(execution.sessionId)
    } finally {
      if (belongsToRecordingSession(execution.sessionId, sessionIdRef.current)) setExecutions((current) => current.filter((item) => item.jobId !== execution.jobId))
    }
  }, [player, refreshSession, voices.directory])

  function newSession() {
    player.close()
    setSession(null)
    setExecutions([])
    setSessionId(crypto.randomUUID())
  }

  function takeView(attempt: RecordingAttempt): RecordingTakeView {
    const status = attempt.status === "failed" || attempt.status === "lost" || attempt.status === "cancelled" ? "failed" : attempt.status === "warning" ? "warning" : ["queued", "running", "retrying"].includes(attempt.status) ? "pending" : "ready"
    return {
      id: attempt.id, status, voice: attempt.request.voice,
      voiceIdentityId: attempt.request.voice_identity_id,
      createdAt: attempt.created_at, durationMs: attempt.duration_ms,
      cost: attempt.cost, costBasis: attempt.cost_basis,
      language: attempt.request.language,
      method: requestCapabilityName(attempt.request, voices.directory),
      engine: attempt.request.engine,
      model: attempt.request.model,
      audioUrl: attempt.audio_url,
      message: attempt.error || attempt.warning,
      script: attempt.request.text,
    }
  }

  if (voices.loading && !voices.config) return <PageLoading label="Loading Speak" />
  if (voices.error && !voices.config) return <ErrorState title="Speak unavailable" message={voices.error} retry={() => void voices.refresh()} />

  return <main className="speak-page">
    <header className="speak-hero"><span><Mic2 /></span><div><small>Standalone tool</small><h1>Speak</h1><p>Create and compare recordings without choosing a Project. Every attempt stays in this session and in Activity.</p></div><Button variant="outline" onClick={newSession}><Plus /> New session</Button></header>
    <section className="speak-workspace"><SpeechTool key={sessionId} sessionId={sessionId} config={voices.config} clonedVoices={voices.cloned} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onGenerate={generate} onPlay={(source) => void player.toggleSource(source)} /></section>
    <section className="speak-takes" aria-live="polite">
      <header><div><small>Recording session</small><h2>Takes</h2></div><span>{(session?.attempts.length || 0) + executions.length} attempts · ${Number(session?.total_cost || 0).toFixed(4)}</span></header>
      {executions.map((execution) => <PendingSpeakExecution key={execution.jobId} execution={execution} directory={voices.directory} onTerminal={(item, job) => void settleExecution(item, job)} />)}
      {sessionLoading && !session?.attempts.length ? <p className="speak-empty">Loading this session…</p> : session?.attempts.length ? session.attempts.map((attempt) => {
        const sourceKey = `job:${attempt.id}`
        return <RecordingTakeCard key={attempt.id} take={takeView(attempt)} directory={voices.directory} active={player.source?.key === sourceKey && player.state === "playing"} onPlay={attempt.audio_url ? () => void player.toggleSource({ key: sourceKey, url: attempt.audio_url!, title: "Generated recording", subtitle: resolveVoice(attempt.request.voice, voices.directory, attempt.request.voice_identity_id).name, kind: "part" }) : undefined} onSecondaryAction={() => void generate({ ...attempt.request, session_id: sessionId })} secondaryLabel="Another take · same setup" />
      }) : !executions.length && <p className="speak-empty">Your first generated recording will appear here. Another take keeps the exact same voice, model, language, script and settings.</p>}
    </section>
    <AudioPlayerDock label="Generated audio" source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} onToggle={() => void player.toggle()} onSeek={player.seek} onClose={player.close} />
  </main>
}
