import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { RecordingClipCard, type RecordingClipView } from "@/components/recording-clip-card"
import { StandaloneComposerHost } from "@/features/composer/standalone-composer-host"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { operationStatusLabel } from "@/lib/operation-language"
import { resolveRequestRoute, resolveRequestVoice } from "@/lib/voice"
import type { DurableJob, GeneratePayload, GenerateResult, RecordingAttempt, RecordingHistory, ResolvedGeneratePayload, VoiceDirectory } from "@/types/domain"
import { recordingAttemptStatus, recoverSpeakExecutions, type SpeakExecution } from "./speak-execution"

import "@/components/production-tools/production-tools.css"
import "./speak-page.css"

function requestCapabilityName(payload: ResolvedGeneratePayload, directory: VoiceDirectory) {
  const route = resolveRequestRoute(payload, directory)
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
  const status = job?.status === "blocked" ? "review" : job && ["failed", "lost", "cancelled"].includes(job.status) ? "failed" : job?.status === "warning" ? "warning" : "pending"
  const route = resolveRequestRoute(execution.payload, directory)
  return <RecordingClipCard clip={{
    id: execution.jobId,
    status,
    voice: route?.provider_voice_id,
    voiceIdentityId: execution.payload.voice_identity_id,
    language: execution.payload.language,
    method: requestCapabilityName(execution.payload, directory),
    engine: route?.engine,
    model: route?.tier,
    modelId: route?.model_id,
    script: execution.payload.text,
    statusLabel: job ? operationStatusLabel(job.status, job.result) : "Queued",
    message: job?.error || job?.detail,
  }} directory={directory} />
}

export function SpeakPage() {
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const [history, setHistory] = useState<RecordingHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [executions, setExecutions] = useState<SpeakExecution[]>([])

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true)
    try { setHistory(await studioApi.recordingHistory()) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Could not load recording history.") }
    finally { setHistoryLoading(false) }
  }, [])

  useEffect(() => { void refreshHistory() }, [refreshHistory])

  useEffect(() => {
    if (!history) return
    setExecutions((current) => recoverSpeakExecutions(current, history))
  }, [history])

  async function generate(payload: GeneratePayload): Promise<DurableJob<GenerateResult>> {
    try {
      const job = await studioApi.enqueueGenerate(payload)
      setExecutions((current) => [...current, { jobId: job.id, payload }])
      return job
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Generation failed.")
      throw reason
    }
  }

  async function confirmAttempt(attempt: RecordingAttempt) {
    try {
      const job = await studioApi.confirmJob<GenerateResult>(attempt.id)
      setExecutions((current) => current.some((item) => item.jobId === job.id)
        ? current
        : [...current, { jobId: job.id, payload: attempt.request }])
      await refreshHistory()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Cost confirmation failed.")
    }
  }

  const settleExecution = useCallback(async (execution: SpeakExecution, job: DurableJob<GenerateResult>) => {
    try {
      if (job.status === "ok" || job.status === "warning") {
        const result = playableGenerateResult(job.result)
        const name = resolveRequestVoice(execution.payload, voices.directory).name
        await player.toggleSource({ key: `job:${job.id}`, url: result.url, title: "Generated recording", subtitle: `${name} · ${result.cost_basis || "estimated cost"}`, kind: "standalone" })
        if (result.warning) toast.warning(result.warning)
        else toast.success(`Audio ready${result.cost !== undefined ? ` · $${result.cost.toFixed(4)}` : ""}`)
      } else if (job.status === "blocked") {
        toast.warning(job.detail || "This generation needs review before it can continue.")
      } else {
        toast.error(job.error || "Generation failed.")
      }
      await refreshHistory()
    } finally {
      setExecutions((current) => current.filter((item) => item.jobId !== execution.jobId))
    }
  }, [player, refreshHistory, voices.directory])

  function clipView(attempt: RecordingAttempt): RecordingClipView {
    const status = recordingAttemptStatus(attempt)
    const route = resolveRequestRoute(attempt.request, voices.directory)
    return {
      id: attempt.id, status, voice: attempt.request.voice || route?.provider_voice_id,
      voiceIdentityId: attempt.request.voice_identity_id,
      createdAt: attempt.created_at, durationMs: attempt.duration_ms,
      cost: attempt.cost, costBasis: attempt.cost_basis,
      language: attempt.request.language,
      method: requestCapabilityName(attempt.request, voices.directory),
      engine: attempt.request.engine || route?.engine,
      model: attempt.request.model || route?.tier,
      modelId: attempt.request.model_id || route?.model_id,
      audioUrl: attempt.audio_url,
      message: attempt.error || attempt.warning,
      script: attempt.request.text,
      statusLabel: operationStatusLabel(attempt.status, attempt),
    }
  }

  if (voices.loading && !voices.config) return <PageLoading label="Loading Speak" />
  if (voices.error && !voices.config) return <ErrorState title="Speak unavailable" message={voices.error} retry={() => void voices.refresh()} />
  const attemptCount = new Set([
    ...(history?.recordings.map((attempt) => attempt.id) || []),
    ...executions.map((execution) => execution.jobId),
  ]).size

  return <main className="speak-page">
    <h1 className="sr-only">Speak</h1>
    {voices.error && voices.config && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void voices.refresh()} />}
    <section className="speak-workspace"><StandaloneComposerHost config={voices.config} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onGenerate={generate} onPlay={(source) => void player.toggleSource(source)} /></section>
    <section className="speak-recordings" aria-live="polite">
      <header><div><small>Sandbox</small><h2>Your recordings</h2><p>Every result stays here with its real voice, route, script, language, cost and status.</p></div><span>{attemptCount} recordings · ${Number(history?.total_cost || 0).toFixed(4)}</span></header>
      {executions.map((execution) => <PendingSpeakExecution key={execution.jobId} execution={execution} directory={voices.directory} onTerminal={(item, job) => void settleExecution(item, job)} />)}
      {historyLoading && !history?.recordings.length ? <p className="speak-empty">Loading recording history…</p> : history?.recordings.length ? history.recordings.filter((attempt) => !executions.some((execution) => execution.jobId === attempt.id)).map((attempt) => {
        const sourceKey = `job:${attempt.id}`
        const confirmation = attempt.status === "blocked" && attempt.needs_confirmation && !attempt.requires_review && !attempt.continued_by_job_id
        return <RecordingClipCard key={attempt.id} clip={clipView(attempt)} directory={voices.directory} active={player.source?.key === sourceKey && player.state === "playing"} onPlay={attempt.audio_url ? () => void player.toggleSource({ key: sourceKey, url: attempt.audio_url!, title: "Generated recording", subtitle: resolveRequestVoice(attempt.request, voices.directory).name, kind: "standalone" }) : undefined} onSecondaryAction={confirmation ? () => void confirmAttempt(attempt) : attempt.status === "blocked" ? undefined : () => void generate(attempt.request)} secondaryLabel={confirmation ? `Confirm $${Number(attempt.estimate || 0).toFixed(4)}` : "Record again · same setup"} />
      }) : !executions.length && <p className="speak-empty">Your first recording will appear here and remain available for reuse.</p>}
    </section>
  </main>
}
