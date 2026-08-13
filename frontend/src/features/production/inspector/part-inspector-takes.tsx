import { Layers3, LoaderCircle, Plus } from "lucide-react"

import { RecordingTakeCard } from "@/components/recording-take-card"
import { Button } from "@/components/ui/button"
import { audioUrl } from "@/lib/api"
import { resolveVoice } from "@/lib/voice"
import { speechEngineLabel } from "@/components/speech-route-label"
import type { PlayerSource, ProductionPart, Take, VoiceDirectory } from "@/types/domain"
import { selectedTakeWording } from "./part-inspector-script"

function takeInput(take: Take) {
  if (take.text_state === "raw") return { label: "Original", value: take.raw_text || "" }
  if (take.text_state === "shaped") return { label: "Spoken", value: take.text || "" }
  if (take.text_state === "tagged") return { label: "Tagged", value: take.tagged_text || "" }
  return { label: "Unknown", value: "" }
}

export function stableAlternativeOrdinals(takes: Take[], selectedOrdinal?: number | null) {
  const ascending = [...takes].sort((left, right) => left.when.localeCompare(right.when) || left.id - right.id)
  return new Map(ascending.map((take, index) => {
    const withoutSelected = index + 1
    return [take.id, selectedOrdinal && withoutSelected >= selectedOrdinal ? withoutSelected + 1 : withoutSelected]
  }))
}

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
  const selectedWording = selectedTakeWording(part)
  const ordinals = stableAlternativeOrdinals(takes, part.selected_take_number)
  return <div className="inspector-panel inspector-takes-panel">
    <section className="inspector-take-intro">
      <div><span className="eyebrow">Creative performances</span><h3>{takes.length + 1} Takes for this Part</h3><p>Listen in context, compare immutable performance facts, then choose one Take for the mix.</p></div>
      <Button variant="outline" onClick={() => onNewTake(part)}><Plus /> New Take</Button>
    </section>

    <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Selected for the mix</span><h3>Current performance</h3></div></div>
      <RecordingTakeCard take={{ id: String(part.selected_take_id || part.id), status: part.outdated ? "outdated" : "current", statusLabel: part.outdated ? "Selected · outdated" : "Selected for mix", ordinal: part.selected_take_number, inputState: selectedWording.label, selected: true, voice: part.voice, voiceIdentityId: part.voice_identity_id, durationMs: Number(part.duration_ms || 0), cost: part.cost, costBasis: part.cost_basis, language: part.language, method: part.capability_name || speechEngineLabel(part.engine), engine: part.engine, model: part.model, audioUrl: part.filename ? audioUrl(part.filename) : null, message: part.outdated ? `Made from an older Part revision. Current revision is ${part.revision || 1}.` : part.fidelity && part.fidelity.status !== "pass" ? part.fidelity.message : undefined, script: selectedWording.value || undefined }} directory={directory} active={playerPlaying && playingKey === currentKey} onPlay={part.filename ? () => onPlay({ key: currentKey, url: audioUrl(part.filename!), title: `Take ${part.selected_take_number || "—"}`, subtitle: resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: "take" }) : undefined} />
    </section>

    <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Alternatives</span><h3>Other performances</h3></div><span>{takes.length}</span></div>
      {loading ? <p className="inspector-empty"><LoaderCircle className="spin" /> Loading Takes…</p> : takes.length ? <div className="inspector-take-list">{takes.map((take) => {
        const key = `take:${take.id}`
        const input = takeInput(take)
        const ordinal = ordinals.get(take.id)
        return <RecordingTakeCard key={take.id} take={{ id: take.public_id || String(take.id), status: take.outdated ? "outdated" : take.fidelity && take.fidelity.status !== "pass" ? "warning" : "ready", statusLabel: take.outdated ? "Historical · outdated" : take.fidelity && take.fidelity.status !== "pass" ? "Ready · review wording" : "Ready to compare", ordinal, inputState: input.label, voice: take.voice, voiceIdentityId: take.voice_identity_id, createdAt: take.when, durationMs: Number(take.duration_ms || 0), cost: take.cost, costBasis: take.cost_basis || undefined, language: take.language, method: speechEngineLabel(take.engine), engine: take.engine, model: take.model, audioUrl: audioUrl(take.filename), message: take.outdated ? `Made from Part revision ${take.source_part_revision}; current revision is ${part.revision || 1}.` : take.fidelity && take.fidelity.status !== "pass" ? take.fidelity.message : input.label === "Unknown" ? "Historical input version is unknown; Audio Studio will not infer it." : undefined, script: input.value || undefined }} directory={directory} active={playerPlaying && playingKey === key} onPlay={() => onPlay({ key, url: audioUrl(take.filename), title: `Take ${ordinal || "—"}`, subtitle: resolveVoice(take.voice, directory, take.voice_identity_id).name, kind: "take" })} onSecondaryAction={() => onPromote(take)} secondaryLabel="Use in mix" />
      })}</div> : <div className="inspector-empty is-rich"><Layers3 /><span><b>No alternatives yet</b><small>Create a different performance without replacing the selected Take.</small></span></div>}
    </section>
  </div>
}
