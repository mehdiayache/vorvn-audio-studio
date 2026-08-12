import { LoaderCircle, Plus } from "lucide-react"

import { RecordingTakeCard } from "@/components/recording-take-card"
import { Button } from "@/components/ui/button"
import { audioUrl } from "@/lib/api"
import { resolveVoice } from "@/lib/voice"
import { speechEngineLabel } from "@/components/speech-route-label"
import type { PlayerSource, ProductionPart, Take, VoiceDirectory } from "@/types/domain"

export function PartInspectorTakes({ part, takes, loading, directory, playingKey, playerPlaying, onPlay, onNewTake, onPromote }: {
  part: ProductionPart
  takes: Take[]
  loading: boolean
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onNewTake: (part: ProductionPart) => void
  onPromote: (take: Take) => void
}) {
  const currentKey = `part:${part.id}`
  return <div className="inspector-panel">
    <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Selected for the mix</span><h3>Current Take</h3></div><Button onClick={() => onNewTake(part)}><Plus /> Generate alternative</Button></div>
      <RecordingTakeCard take={{ id: String(part.selected_take_id || part.id), status: part.outdated ? "outdated" : "current", voice: part.voice, voiceIdentityId: part.voice_identity_id, durationMs: Number(part.duration_ms || 0), cost: part.cost, costBasis: part.cost_basis, language: part.language, method: speechEngineLabel(part.engine), engine: part.engine, model: part.model, audioUrl: part.filename ? audioUrl(part.filename) : null, message: part.outdated ? `Made from an older Part revision. Current revision is ${part.revision || 1}.` : part.fidelity && part.fidelity.status !== "pass" ? part.fidelity.message : undefined }} directory={directory} active={playerPlaying && playingKey === currentKey} onPlay={part.filename ? () => onPlay({ key: currentKey, url: audioUrl(part.filename!), title: "Current Take", subtitle: resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: "take" }) : undefined} />
    </section>
    <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">History</span><h3>Alternative Takes</h3></div><span>{takes.length}</span></div>
      {loading ? <p className="inspector-empty"><LoaderCircle className="spin" /> Loading Takes…</p> : takes.length ? <div className="inspector-take-list">{takes.map((take) => {
        const key = `take:${take.id}`
        return <RecordingTakeCard key={take.id} take={{ id: take.public_id || String(take.id), status: take.outdated ? "outdated" : take.fidelity && take.fidelity.status !== "pass" ? "warning" : "ready", voice: take.voice, voiceIdentityId: take.voice_identity_id, createdAt: take.when, durationMs: Number(take.duration_ms || 0), cost: take.cost, costBasis: take.cost_basis || undefined, language: take.language, method: speechEngineLabel(take.engine), engine: take.engine, model: take.model, audioUrl: audioUrl(take.filename), message: take.outdated ? `Made from Part revision ${take.source_part_revision}; current revision is ${part.revision || 1}.` : take.fidelity && take.fidelity.status !== "pass" ? take.fidelity.message : undefined, script: take.text }} directory={directory} active={playerPlaying && playingKey === key} onPlay={() => onPlay({ key, url: audioUrl(take.filename), title: "Alternative Take", subtitle: resolveVoice(take.voice, directory, take.voice_identity_id).name, kind: "take" })} onSecondaryAction={() => onPromote(take)} secondaryLabel="Use this Take" />
      })}</div> : <p className="inspector-empty">No alternatives yet. Generate another performance without losing the selected Take.</p>}
    </section>
  </div>
}
