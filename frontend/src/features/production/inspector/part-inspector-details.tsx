import { Badge } from "@/components/ui/badge"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { speechEngineLabel, speechModelLabel } from "@/components/speech-route-label"
import { formatDuration, formatExactDurationMs, formatMoney } from "@/lib/format"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

function Fact({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "is-mono" : undefined}>{value === undefined || value === null || value === "" ? "—" : String(value)}</dd></div>
}

export function PartInspectorDetails({ part, directory }: { part: ProductionPart; directory: VoiceDirectory }) {
  const recorded = Boolean(part.clip_id)
  const draft = part.kind === "draft"
  const silence = part.kind === "silence"
  const asset = part.kind === "asset"
  const diagnostics = { provider_attempt_id: part.provider_attempt_id, provider_attempt_status: part.provider_attempt_status, delivery: part.clip_delivery, usage: part.clip_usage, segmentation: part.clip_segmentation }

  return <div className="inspector-panel inspector-details-panel">
    {recorded && <>
      <section>
        <div className="inspector-section-heading"><div><span className="eyebrow">Active recording</span><h3>Recording route</h3></div>{part.binding_resolution_status === "unresolved" && <Badge variant="destructive">Historical route unresolved</Badge>}</div>
        <SpeechModelIdentity engine={part.engine} model={part.model} config={directory.config} />
        <dl className="inspector-facts">
          <Fact label="Provider" value={part.provider} />
          <Fact label="Region" value={part.provider_region} />
          <Fact label="Exact model ID" value={part.model} mono />
          <Fact label="Tier" value={part.tier || speechModelLabel(part.model)} />
          <Fact label="Recording method" value={speechEngineLabel(part.engine)} />
          <Fact label="Capability" value={part.capability_name || part.capability_id} />
          <Fact label="Output language" value={part.language || "Auto"} />
          <Fact label="Format" value={(part.format || "MP3").toUpperCase()} />
        </dl>
      </section>
      <section>
        <div className="inspector-section-heading"><div><span className="eyebrow">Snapshot provenance</span><h3>Identity and source</h3></div><Badge variant="outline">Part revision {part.revision || 1}</Badge></div>
        <dl className="inspector-facts">
          <Fact label="Recording ID" value={part.clip_public_id} mono />
          <Fact label="Voice Identity" value={part.voice_identity_id} mono />
          <Fact label="Binding ID" value={part.binding_id} mono />
          <Fact label="Catalogue Voice ID" value={part.catalogue_voice_id} mono />
          <Fact label="Voice Reference" value={part.reference_id} mono />
        </dl>
      </section>
      <section>
        <div className="inspector-section-heading"><div><span className="eyebrow">Accounting</span><h3>Usage and cost</h3></div></div>
        <dl className="inspector-facts"><Fact label="Active recording cost" value={formatMoney(part.cost)} /><Fact label="Historical Part spend" value={formatMoney(part.spent ?? part.cost)} /><Fact label="Cost basis" value={part.cost_basis} /><Fact label="Audio size" value={part.size_bytes ? `${Math.round(part.size_bytes / 1024)} KB` : null} /></dl>
      </section>
      <details className="inspector-diagnostics"><summary><span><b>Technical evidence</b><small>Provider attempt, raw usage and diagnostics</small></span></summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>
    </>}

    {draft && <section><div className="inspector-section-heading"><div><span className="eyebrow">Editorial object</span><h3>Draft speech</h3></div><Badge variant="outline">Revision {part.revision || 1}</Badge></div><dl className="inspector-facts"><Fact label="Part ID" value={part.public_id || part.id} mono /><Fact label="Position" value={(part.position ?? 0) + 1} /><Fact label="Editorial state" value={part.editorial_status || "Draft"} /></dl><p className="inspector-truth-note">A Draft has editorial text and future recording context. It has no active recording or provider attempt yet.</p></section>}

    {silence && <section><div className="inspector-section-heading"><div><span className="eyebrow">Editorial timing</span><h3>Silence Part</h3></div></div><dl className="inspector-facts"><Fact label="Part ID" value={part.public_id || part.id} mono /><Fact label="Position" value={(part.position ?? 0) + 1} /><Fact label="Exact duration" value={formatExactDurationMs(Number(part.duration_ms || 0))} /><Fact label="Duration (ms)" value={part.duration_ms || 0} /></dl><p className="inspector-truth-note">Silence has no Voice, recording, captions, provider, or generation spend.</p></section>}

    {asset && <section><div className="inspector-section-heading"><div><span className="eyebrow">Linked Venture audio</span><h3>{part.title || "Audio asset"}</h3></div></div><dl className="inspector-facts"><Fact label="Part ID" value={part.public_id || part.id} mono /><Fact label="Position" value={(part.position ?? 0) + 1} /><Fact label="Asset kind" value={part.asset_kind} /><Fact label="Collection" value={part.asset_collection} /><Fact label="Asset ID" value={part.asset_id} mono /><Fact label="Version ID" value={part.asset_version_id} mono /><Fact label="Duration" value={formatDuration(Number(part.duration_ms || 0) / 1000)} /><Fact label="Linked file" value={part.filename} mono /></dl><p className="inspector-truth-note">This Part links a reusable Venture asset. Editing Sequence placement does not mutate the source asset.</p></section>}
  </div>
}
