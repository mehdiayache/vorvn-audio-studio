import { Mic2, Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { AudioPlayerDock } from "@/components/audio-player-dock"
import { RecordingTakeCard, type RecordingTakeView } from "@/components/recording-take-card"
import { SpeechTool } from "@/components/production-tools/speech-tool"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { capabilityTitle } from "@/lib/voice-capabilities"
import { resolveVoice } from "@/lib/voice"
import type { GeneratePayload, GenerateResult, RecordingAttempt, RecordingSession } from "@/types/domain"

import "@/components/production-tools/production-tools.css"
import "./speak-page.css"

export function SpeakPage() {
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const [sessionId, setSessionId] = useState(() => {
    const current = new URLSearchParams(window.location.search).get("session")
    return current && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(current) ? current : crypto.randomUUID()
  })
  const [session, setSession] = useState<RecordingSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [pending, setPending] = useState<GeneratePayload | null>(null)

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

  async function generate(payload: GeneratePayload): Promise<GenerateResult> {
    const request = { ...payload, session_id: sessionId }
    setPending(request)
    try {
      const raw = await studioApi.generate(request)
      if (raw.needs_confirmation) return raw
      const result = playableGenerateResult(raw)
      const name = resolveVoice(request.voice, voices.directory, request.voice_identity_id).name
      await player.toggleSource({ key: result.job_id ? `job:${result.job_id}` : result.id ? `part:${result.id}` : `generated:${Date.now()}`, url: result.url, title: "Generated recording", subtitle: `${name} · ${result.cost_basis || "estimated cost"}`, kind: "part" })
      if (result.warning) toast.warning(result.warning)
      else toast.success(`Audio ready${result.cost !== undefined ? ` · $${result.cost.toFixed(4)}` : ""}`)
      return result
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Generation failed.")
      throw reason
    } finally { setPending(null); await refreshSession() }
  }

  function newSession() {
    player.close()
    setSession(null)
    setPending(null)
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
      method: capabilityTitle(attempt.request.engine, voices.config),
      audioUrl: attempt.audio_url,
      message: attempt.error || attempt.warning,
      script: attempt.request.text,
    }
  }

  if (voices.loading && !voices.config) return <PageLoading label="Loading Speak" />
  if (voices.error && !voices.config) return <ErrorState title="Speak unavailable" message={voices.error} retry={() => void voices.refresh()} />

  return <main className="speak-page">
    <header className="speak-hero"><span><Mic2 /></span><div><small>Standalone tool</small><h1>Speak</h1><p>Create and compare recordings without choosing a Project. Every attempt stays in this session and in Activity.</p></div><Button variant="outline" onClick={newSession}><Plus /> New session</Button></header>
    <section className="speak-workspace"><SpeechTool config={voices.config} clonedVoices={voices.cloned} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onGenerate={generate} onPlay={(source) => void player.toggleSource(source)} /></section>
    <section className="speak-takes" aria-live="polite">
      <header><div><small>Recording session</small><h2>Takes</h2></div><span>{session?.attempts.length || 0} attempts · ${Number(session?.total_cost || 0).toFixed(4)}</span></header>
      {pending && <RecordingTakeCard take={{ id: "pending", status: "pending", voice: pending.voice, voiceIdentityId: pending.voice_identity_id, language: pending.language, method: capabilityTitle(pending.engine, voices.config), script: pending.text }} directory={voices.directory} />}
      {sessionLoading && !session?.attempts.length ? <p className="speak-empty">Loading this session…</p> : session?.attempts.length ? session.attempts.map((attempt) => {
        const sourceKey = `job:${attempt.id}`
        return <RecordingTakeCard key={attempt.id} take={takeView(attempt)} directory={voices.directory} active={player.source?.key === sourceKey && player.state === "playing"} onPlay={attempt.audio_url ? () => void player.toggleSource({ key: sourceKey, url: attempt.audio_url!, title: "Generated recording", subtitle: resolveVoice(attempt.request.voice, voices.directory, attempt.request.voice_identity_id).name, kind: "part" }) : undefined} onSecondaryAction={() => void generate({ ...attempt.request, session_id: sessionId })} secondaryLabel="Another take · same setup" />
      }) : !pending && <p className="speak-empty">Your first generated recording will appear here. Another take keeps the exact same voice, model, language, script and settings.</p>}
    </section>
    <AudioPlayerDock label="Generated audio" source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} onToggle={() => void player.toggle()} onSeek={player.seek} onClose={player.close} />
  </main>
}
