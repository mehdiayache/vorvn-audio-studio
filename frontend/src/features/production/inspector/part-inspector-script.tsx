import { Check, CircleAlert, Clock3, Columns2, Copy, FileAudio, Mic2, Pause, Pencil, Play, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VoiceIdentity } from "@/components/voice-identity"
import { audioUrl } from "@/lib/api"
import { formatDuration, formatExactDurationMs, formatMoney, formatPartLabel, textDirection } from "@/lib/format"
import { resolveVoice } from "@/lib/voice"
import type { PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"

export function recordingWording(part: ProductionPart) {
  const state = part.recording_text_state
  if (state === "raw") return { state, label: "Original", value: part.clip_raw_text || "" }
  if (state === "shaped") return { state, label: "Spoken", value: part.clip_spoken_text || "" }
  if (state === "tagged") return { state, label: "Tagged", value: part.clip_tagged_text || "" }
  return { state: null, label: "Unknown", value: "" }
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return <Button variant="ghost" size="sm" disabled={!value} onClick={() => void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) })}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : label}</Button>
}

export function PartInspectorScript({ part, directory, currentPlaying, onPlay, onRecordPart, onDuplicate, onDelete }: {
  part: ProductionPart
  directory: VoiceDirectory
  currentPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onRecordPart: (part: ProductionPart) => void
  onDuplicate: (part: ProductionPart) => void
  onDelete: (part: ProductionPart) => void
}) {
  const [compareOpen, setCompareOpen] = useState(false)
  const currentKey = `part:${part.id}`
  const recorded = Boolean(part.clip_id)
  const silence = part.kind === "silence"
  const asset = part.kind === "asset"
  const clipWording = recordingWording(part)
  const voiceName = resolveVoice(part.voice, directory, part.voice_identity_id).name

  return <div className="inspector-panel inspector-text-panel">
    <div className="inspector-part-summary">
      <span>{silence ? <Clock3 /> : asset ? <FileAudio /> : <Mic2 />}</span>
      <div className="inspector-summary-copy">{silence ? <><b>Intentional silence</b><p>Editorial timing · {formatExactDurationMs(Number(part.duration_ms || 0))}</p></> : asset ? <><b>{part.title || "Venture audio"}</b><p>Linked Venture asset · {formatDuration(Number(part.duration_ms || 0) / 1000)}</p></> : <><VoiceIdentity voice={part.voice} identityId={part.voice_identity_id} directory={directory} compact /><p>{recorded ? `Active recording · ${formatDuration(Number(part.duration_ms || 0) / 1000)} · ${formatMoney(part.spent ?? part.cost)}` : `Draft speech · revision ${part.revision || 1}`}</p></>}</div>
      <div className="inspector-summary-actions">
        {part.filename && <Button variant="outline" size="icon" aria-label={currentPlaying ? "Pause current part" : "Play current part"} onClick={() => onPlay({ key: currentKey, url: audioUrl(part.filename!), title: formatPartLabel(part.position ?? 0), subtitle: asset ? "Linked Venture asset" : voiceName, kind: asset ? "asset" : "clip" })}>{currentPlaying ? <Pause /> : <Play />}</Button>}
        {!silence && !asset && <Button variant="outline" onClick={() => onRecordPart(part)}><Pencil /> Edit in Composer</Button>}
      </div>
    </div>

    {part.missing && <div className="inspector-warning"><CircleAlert /><span><b>Source audio is missing</b><p>Preview and export remain blocked until the source is restored or this Part is removed.</p></span></div>}
    {part.outdated && <div className="inspector-warning"><CircleAlert /><span><b>Recording is outdated</b><p>The Part changed after this recording was generated. Replace it before final release.</p></span></div>}
    {!silence && !asset && <section className="inspector-text-block">
      <div className="inspector-section-heading"><div><span className="eyebrow">Editorial truth</span><h3>Canonical Part script</h3></div><div className="inspector-heading-actions"><Badge variant="outline">Revision {part.revision || 1}</Badge><CopyButton value={part.text || ""} /></div></div>
      <p className="inspector-script is-canonical" dir={textDirection(part.text)}>{part.text || "This Part has no written script."}</p>
    </section>}

    {recorded && <section className="inspector-text-block is-clip-wording">
      <div className="inspector-section-heading"><div><span className="eyebrow">Active recording</span><h3>Recorded wording</h3></div><div className="inspector-heading-actions"><Badge className="inspector-used-badge">{clipWording.label} · used</Badge><CopyButton value={clipWording.value} /><Button variant="ghost" size="sm" disabled={!clipWording.value || !part.text} onClick={() => setCompareOpen(true)}><Columns2 /> Compare</Button></div></div>
      {clipWording.value ? <p className="inspector-script" dir={textDirection(clipWording.value)}>{clipWording.value}</p> : <div className="inspector-truth-empty"><CircleAlert /><span><b>Input version is unknown</b><small>This historical recording does not contain enough snapshot truth to identify or reconstruct its active wording safely.</small></span></div>}
    </section>}

    {asset && <section className="inspector-type-view"><FileAudio /><div><span className="eyebrow">Venture source</span><h3>{part.title || "Audio asset"}</h3><p>This reusable Venture audio is linked into the Sequence. Replacing or moving this Part does not alter the source asset.</p></div></section>}
    {silence && <section className="inspector-type-view"><Clock3 /><div><span className="eyebrow">Sequence timing</span><h3>{formatExactDurationMs(Number(part.duration_ms || 0))} of silence</h3><p>Silence is an editorial Part. It has no Voice, recording, provider operation, captions, or generation spend.</p></div></section>}

    <div className="inspector-destructive-actions"><Button variant="outline" onClick={() => onDuplicate(part)}><Copy /> Duplicate</Button><Button variant="ghost" className="danger" onClick={() => onDelete(part)}><Trash2 /> Delete</Button></div>

    <Dialog open={compareOpen} onOpenChange={setCompareOpen}><DialogContent className="inspector-compare-dialog"><DialogHeader><DialogTitle>Compare Part and active recording</DialogTitle><DialogDescription>Current editorial truth beside the wording used to create the active recording.</DialogDescription></DialogHeader><div className="inspector-compare-grid"><section><header><b>Canonical Part</b><Badge variant="outline">Revision {part.revision || 1}</Badge></header><p dir={textDirection(part.text)}>{part.text}</p></section><section><header><b>Active recording</b><Badge className="inspector-used-badge">{clipWording.label} · used</Badge></header><p dir={textDirection(clipWording.value)}>{clipWording.value}</p></section></div></DialogContent></Dialog>
  </div>
}
