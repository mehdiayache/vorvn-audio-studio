import { CircleAlert, Clock3, Copy, FileAudio, Mic2, Pause, Play, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VoiceIdentity } from "@/components/voice-identity"
import { audioUrl } from "@/lib/api"
import { formatDuration, formatMoney, textDirection } from "@/lib/format"
import { resolveVoice } from "@/lib/voice"
import type { PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"

function TextSnapshot({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return <section className="inspector-script-state"><h3>{label}</h3><p dir={textDirection(value)}>{value}</p></section>
}

export function PartInspectorScript({ part, directory, currentPlaying, onPlay, onNewTake, onDuplicate, onDelete }: {
  part: ProductionPart
  directory: VoiceDirectory
  currentPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onNewTake: (part: ProductionPart) => void
  onDuplicate: (part: ProductionPart) => void
  onDelete: (part: ProductionPart) => void
}) {
  const currentKey = `part:${part.id}`
  const recorded = ["audio", "speech"].includes(part.kind)
  const silence = part.kind === "silence"
  const asset = part.kind === "asset"
  return <div className="inspector-panel">
    <div className="inspector-part-summary">
      <span>{silence ? <Clock3 /> : asset ? <FileAudio /> : <Mic2 />}</span>
      <div>{silence ? <><b>Intentional silence</b><p>Editorial timing inside this Production</p></> : asset ? <><b>{part.title || "Venture audio"}</b><p>Linked Venture asset</p></> : <VoiceIdentity voice={part.voice} identityId={part.voice_identity_id} directory={directory} compact />}<p>{formatDuration(Number(part.duration_ms || 0) / 1000)}{!silence && ` · ${formatMoney(part.spent ?? part.cost)}`}</p></div>
      <div className="inspector-summary-actions">
        {part.filename && <Button variant="outline" size="icon" aria-label={currentPlaying ? "Pause current part" : "Play current part"} onClick={() => onPlay({ key: currentKey, url: audioUrl(part.filename!), title: `Part ${(part.position ?? 0) + 1}`, subtitle: part.kind === "asset" ? "Linked Venture asset" : resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: part.kind === "asset" ? "asset" : "take" })}>{currentPlaying ? <Pause /> : <Play />}</Button>}
        {["audio", "speech", "draft"].includes(part.kind) && <Button onClick={() => onNewTake(part)}><Plus /> {part.kind === "draft" ? "Record draft" : "Generate alternative"}</Button>}
      </div>
    </div>

    {part.missing && <div className="inspector-warning"><CircleAlert /><span><b>Source audio is missing</b><p>Preview and export remain blocked until the source is restored or this Part is removed.</p></span></div>}
    {part.outdated && <div className="inspector-warning"><CircleAlert /><span><b>Selected Take is outdated</b><p>The Part changed after this Take was generated. The historical audio remains available.</p></span></div>}
    {part.fidelity && part.fidelity.status !== "pass" && <div className="inspector-warning"><CircleAlert /><span><b>Review the spoken wording</b><p>{part.fidelity.message}{part.fidelity.requested_words ? ` ${part.fidelity.returned_words} of ${part.fidelity.requested_words} compared words were returned.` : ""}</p></span></div>}

    {!silence && !asset && <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Editorial truth</span><h3>Canonical Part script</h3></div><Badge variant="outline">Revision {part.revision || 1}</Badge></div>
      <p className="inspector-script" dir={textDirection(part.text)}>{part.text || "This Part has no written script."}</p>
    </section>}

    {asset && <section><div className="inspector-section-heading"><div><span className="eyebrow">Venture source</span><h3>{part.title || "Audio asset"}</h3></div></div><p className="inspector-script">This reusable Venture audio is linked into the Sequence. Replacing or moving this Part does not alter the source asset.</p></section>}
    {silence && <section><div className="inspector-section-heading"><div><span className="eyebrow">Sequence timing</span><h3>{formatDuration(Number(part.duration_ms || 0) / 1000)} of silence</h3></div></div><p className="inspector-script">Silence is an editorial Part. It has no voice route, Take, provider operation or generation cost.</p></section>}

    {recorded && <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Selected Take</span><h3>Recorded wording</h3></div>{part.take_public_id && <code>{part.take_public_id.slice(0, 8)}</code>}</div>
      <div className="inspector-text-states">
        <TextSnapshot label="Raw" value={part.take_raw_text || part.text_raw} />
        <TextSnapshot label="Spoken" value={part.take_spoken_text || part.provider_text || part.text_shaped} />
        <TextSnapshot label="Tagged" value={part.take_tagged_text || part.text_tagged} />
      </div>
      {part.provider_text && part.provider_text !== part.take_spoken_text && <TextSnapshot label="Provider returned" value={part.provider_text} />}
    </section>}

    <div className="inspector-destructive-actions"><Button variant="outline" onClick={() => onDuplicate(part)}><Copy /> Duplicate</Button><Button variant="outline" className="danger" onClick={() => onDelete(part)}><Trash2 /> Delete</Button></div>
  </div>
}
