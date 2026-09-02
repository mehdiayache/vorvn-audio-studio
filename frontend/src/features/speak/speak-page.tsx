import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { RecordingClipCard, type RecordingClipView } from "@/components/recording-clip-card"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { StandaloneComposerHost } from "@/features/composer/standalone-composer-host"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { originsApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { operationStatusLabel } from "@/lib/operation-language"
import { resolveRequestRoute, resolveRequestVoice } from "@/lib/voice"
import type { DurableJob, GeneratePayload, GenerateResult, RecordingAttempt, RecordingHistory, ResolvedGeneratePayload, VoiceDirectory } from "@/types/domain"
import { recordingAttemptStatus, recoverSpeakExecutions, reusableGeneratePayload, type SpeakExecution } from "./speak-execution"

import "@/features/workspace/library/audio-library.css"
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
  return <RecordingClipCard compact clip={{
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
  const workspaceHome = useWorkspaceExplorer()
  const player = useGlobalPlayer()
  const [history, setHistory] = useState<RecordingHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [executions, setExecutions] = useState<SpeakExecution[]>([])
  const generationLock = useRef<string | null>(null)

  const refreshHistory = useCallback(async () => {
    if (!workspaceHome.selectedWorkspaceId) return
    setHistoryLoading(true)
    try { setHistory(await originsApi.recordingHistory(workspaceHome.selectedWorkspaceId)) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Could not load recording history.") }
    finally { setHistoryLoading(false) }
  }, [workspaceHome.selectedWorkspaceId])

  useEffect(() => {
    setHistory(null)
    setExecutions([])
    generationLock.current = null
  }, [workspaceHome.selectedWorkspaceId])

  useEffect(() => { void refreshHistory() }, [refreshHistory])

  useEffect(() => {
    if (!history) return
    setExecutions((current) => recoverSpeakExecutions(current, history))
  }, [history])

  useEffect(() => {
    if (executions.length && !generationLock.current) {
      generationLock.current = executions[0]?.jobId || null
    } else if (!executions.length && generationLock.current !== "submitting") {
      generationLock.current = null
    }
  }, [executions])

  async function generate(payload: GeneratePayload): Promise<DurableJob<GenerateResult>> {
    if (!workspaceHome.selectedWorkspaceId) throw new Error("Choose a Workspace before generating speech.")
    if (generationLock.current) {
      const reason = new Error("One standalone recording is already generating. Listen to it or wait for it to finish before starting another.")
      toast.warning(reason.message)
      throw reason
    }
    generationLock.current = "submitting"
    try {
      const request = { ...payload, workspace_id: workspaceHome.selectedWorkspaceId }
      const job = await originsApi.enqueueGenerate(request)
      generationLock.current = job.id
      setExecutions((current) => [...current, { jobId: job.id, payload: request }])
      return job
    } catch (reason) {
      generationLock.current = null
      toast.error(reason instanceof Error ? reason.message : "Generation failed.")
      throw reason
    }
  }

  async function confirmAttempt(attempt: RecordingAttempt) {
    try {
      const job = await originsApi.confirmJob<GenerateResult>(attempt.id)
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
      if (generationLock.current === execution.jobId) generationLock.current = null
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
  if (workspaceHome.workspaces.status === "loading") return <PageLoading label="Opening Speak" />
  if (!workspaceHome.selectedWorkspaceId) return <ErrorState title="Choose a Workspace first" message="Speech creates reusable audio Files, so it needs a destination Workspace." retry={() => window.location.assign("/origins/")} />
  if (workspaceHome.overview.status === "error" && !workspaceHome.overview.data) return <ErrorState title="Workspace unavailable" message={workspaceHome.overview.error || "This Workspace could not be loaded."} retry={() => void workspaceHome.refresh()} />
  const workspaceName = workspaceHome.overview.data?.workspace.name || workspaceHome.workspaces.data?.find((workspace) => workspace.id === workspaceHome.selectedWorkspaceId)?.name || "Current Workspace"
  const attemptCount = new Set([
    ...(history?.recordings.map((attempt) => attempt.id) || []),
    ...executions.map((execution) => execution.jobId),
  ]).size
  const generationState = historyLoading ? "recovering" : executions.length ? "active" : null
  const visibleAttempts = history?.recordings.filter(
    (attempt) => !executions.some((execution) => execution.jobId === attempt.id),
  ) || []

  return <main className="speak-page">
    <h1 className="sr-only">Speak</h1>
    <div className="speak-page-location"><ShellBreadcrumbs leaf="Speak" />{voices.error && voices.config && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void voices.refresh()} />}</div>
    <div className="speak-workbench">
      <section className="speak-workspace"><StandaloneComposerHost config={voices.config} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} generationState={generationState} onGenerate={generate} onPlay={(source) => void player.toggleSource(source)} /></section>
      <aside className="speak-session" aria-live="polite">
        <header>
          <div><span className="eyebrow">{workspaceName}</span><h2>This session</h2></div>
          <span>{attemptCount} audio files · ${Number(history?.total_cost || 0).toFixed(4)}</span>
        </header>
        <p className="speak-session-intro">The active generation stays visible here. Finished audio remains reusable in this Workspace.</p>
        <ScrollArea className="speak-session-scroll">
          {executions.length > 0 && <section className="speak-session-group"><h3>Generating now</h3>{executions.map((execution) => <PendingSpeakExecution key={execution.jobId} execution={execution} directory={voices.directory} onTerminal={(item, job) => void settleExecution(item, job)} />)}</section>}
          <section className="speak-session-group"><h3>Recent audio</h3>
          {historyLoading && !visibleAttempts.length ? <p className="speak-empty">Loading audio from {workspaceName}…</p> : visibleAttempts.length ? visibleAttempts.map((attempt) => {
        const sourceKey = `job:${attempt.id}`
        const confirmation = attempt.status === "blocked" && attempt.needs_confirmation && !attempt.requires_review && !attempt.continued_by_job_id
        return <RecordingClipCard compact key={attempt.id} clip={clipView(attempt)} directory={voices.directory} active={player.source?.key === sourceKey && player.state === "playing"} onPlay={attempt.audio_url ? () => void player.toggleSource({ key: sourceKey, url: attempt.audio_url!, title: "Generated audio", subtitle: resolveRequestVoice(attempt.request, voices.directory).name, kind: "standalone" }) : undefined} onSecondaryAction={confirmation ? () => void confirmAttempt(attempt) : attempt.status === "blocked" ? undefined : () => void generate(reusableGeneratePayload(attempt.request))} secondaryDisabled={Boolean(generationState)} secondaryLabel={confirmation ? `Confirm $${Number(attempt.estimate || 0).toFixed(4)}` : "Generate again"} />
          }) : !executions.length && <p className="speak-empty">Your first generated audio will appear here and remain available for reuse.</p>}
          </section>
        </ScrollArea>
      </aside>
    </div>
  </main>
}
