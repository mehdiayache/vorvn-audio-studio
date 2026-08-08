import { Mic2 } from "lucide-react"
import { toast } from "sonner"

import { AudioPlayerDock } from "@/components/audio-player-dock"
import { SpeechTool } from "@/components/production-tools/speech-tool"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { usePlayer } from "@/hooks/use-player"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { resolveVoice } from "@/lib/voice"
import type { GeneratePayload, GenerateResult } from "@/types/domain"

import "@/components/production-tools/production-tools.css"
import "./speak-page.css"

export function SpeakPage() {
  const voices = useVoiceDirectory()
  const player = usePlayer()

  async function generate(payload: GeneratePayload): Promise<GenerateResult> {
    try {
      const raw = await studioApi.generate(payload)
      if (raw.needs_confirmation) return raw
      const result = playableGenerateResult(raw)
      const name = resolveVoice(payload.voice, voices.directory).name
      await player.toggleSource({ key: result.id ? `part:${result.id}` : `generated:${Date.now()}`, url: result.url, title: "Generated recording", subtitle: `${name} · ${result.cost_basis || "estimated cost"}`, kind: "part" })
      if (result.warning) toast.warning(result.warning)
      else toast.success(`Audio ready${result.cost !== undefined ? ` · $${result.cost.toFixed(4)}` : ""}`)
      return result
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Generation failed.")
      throw reason
    }
  }

  if (voices.loading && !voices.config) return <PageLoading label="Loading Speak" />
  if (voices.error && !voices.config) return <ErrorState title="Speak unavailable" message={voices.error} retry={() => void voices.refresh()} />

  return <main className="speak-page">
    <header className="speak-hero"><span><Mic2 /></span><div><small>Standalone tool</small><h1>Speak</h1><p>Create one recording without choosing a Project. The result remains in Activity and can be downloaded immediately.</p></div></header>
    <section className="speak-workspace"><SpeechTool config={voices.config} clonedVoices={voices.cloned} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onGenerate={generate} onPlay={(source) => void player.toggleSource(source)} /></section>
    <AudioPlayerDock label="Generated audio" source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} onToggle={() => void player.toggle()} onSeek={player.seek} onClose={player.close} />
  </main>
}
