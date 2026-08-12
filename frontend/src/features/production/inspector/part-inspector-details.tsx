import { Badge } from "@/components/ui/badge"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { speechEngineLabel, speechModelLabel } from "@/components/speech-route-label"
import { formatMoney } from "@/lib/format"
import type { ProductionPart, VoiceDirectory } from "@/types/domain"

function Fact({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "is-mono" : undefined}>{value === undefined || value === null || value === "" ? "—" : String(value)}</dd></div>
}

export function PartInspectorDetails({ part, directory }: { part: ProductionPart; directory: VoiceDirectory }) {
  const diagnostics = { fidelity: part.fidelity, delivery: part.take_delivery, usage: part.take_usage, segmentation: part.take_segmentation }
  const recorded = ["audio", "speech", "draft"].includes(part.kind)
  return <div className="inspector-panel">
    {recorded && <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Exact result</span><h3>Recording route</h3></div>{part.binding_resolution_status === "unresolved" && <Badge variant="destructive">Historical route unresolved</Badge>}</div>
      <SpeechModelIdentity engine={part.engine} model={part.model} config={directory.config} />
      <dl className="inspector-facts">
        <Fact label="Provider" value={part.provider} />
        <Fact label="Region" value={part.provider_region} />
        <Fact label="Exact model" value={part.model} mono />
        <Fact label="Tier" value={part.tier || speechModelLabel(part.model)} />
        <Fact label="Recording method" value={speechEngineLabel(part.engine)} />
        <Fact label="Capability" value={part.capability_id} mono />
        <Fact label="Language" value={part.language || "Auto"} />
        <Fact label="Format" value={part.format || "MP3"} />
      </dl>
    </section>}
    {recorded && <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Immutable evidence</span><h3>Identity and attempt</h3></div></div>
      <dl className="inspector-facts">
        <Fact label="Take ID" value={part.take_public_id} mono />
        <Fact label="Voice Identity" value={part.voice_identity_id} mono />
        <Fact label="Binding ID" value={part.binding_id} mono />
        <Fact label="Catalogue Voice ID" value={part.catalogue_voice_id} mono />
        <Fact label="Reference ID" value={part.reference_id} mono />
        <Fact label="Provider Attempt" value={part.provider_attempt_id} mono />
        <Fact label="Attempt state" value={part.provider_attempt_status} />
        <Fact label="Part revision" value={part.revision || 1} />
      </dl>
    </section>}
    {!recorded && <section><div className="inspector-section-heading"><div><span className="eyebrow">Part details</span><h3>{part.kind === "silence" ? "Editorial timing" : "Linked Venture asset"}</h3></div></div><dl className="inspector-facts"><Fact label="Part ID" value={part.public_id || part.id} mono /><Fact label="Type" value={part.kind} /><Fact label="Position" value={(part.position ?? 0) + 1} /><Fact label="Duration" value={`${Number(part.duration_ms || 0) / 1000} seconds`} />{part.kind === "asset" && <><Fact label="Source" value={part.title} /><Fact label="File" value={part.filename} mono /></>}</dl></section>}
    {recorded && <section>
      <div className="inspector-section-heading"><div><span className="eyebrow">Accounting</span><h3>Usage and cost</h3></div></div>
      <dl className="inspector-facts"><Fact label="Generated cost" value={formatMoney(part.cost)} /><Fact label="Historical Part spend" value={formatMoney(part.spent ?? part.cost)} /><Fact label="Cost basis" value={part.cost_basis} /><Fact label="Size" value={part.size_bytes ? `${Math.round(part.size_bytes / 1024)} KB` : null} /></dl>
    </section>}
    {recorded && Object.values(diagnostics).some(Boolean) && <details className="inspector-diagnostics"><summary>Technical diagnostics</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>}
  </div>
}
