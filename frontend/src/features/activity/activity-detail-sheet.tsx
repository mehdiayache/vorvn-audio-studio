import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatMoney } from "@/lib/format"
import type { ActivityRun } from "@/types/domain"
import { costBasisLabel } from "./activity-run-card"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children || "Not reported"}</dd></div>
}

function ProviderDiagnostics({ diagnostics }: { diagnostics: ActivityRun["provider_diagnostics"] }) {
  if (!diagnostics.length) return null
  return <section className="provider-diagnostics">
    <h3>Provider sections</h3>
    <p>{diagnostics.length} Alibaba request{diagnostics.length === 1 ? "" : "s"}. Replaced sections were billed but excluded from the final audio.</p>
    <div>{diagnostics.map((item, index) => {
      const fidelity = item.fidelity && typeof item.fidelity === "object" ? item.fidelity as Record<string, unknown> : null
      const status = String(item.status || "unknown")
      return <details key={`${String(item.path || index)}:${String(item.request_id || index)}`} className={status}>
        <summary><b>Section {String(item.path || index + 1)}</b><span>{status}</span><small>{fidelity?.coverage !== undefined ? `${Math.round(Number(fidelity.coverage) * 100)}% words` : "No comparison"}</small></summary>
        <dl><Field label="Finish reason">{String(item.finish_reason || "Not reported")}</Field><Field label="Request ID">{String(item.request_id || "Not reported")}</Field><Field label="Stream events">{String(item.event_count ?? "Not reported")}</Field><Field label="Depth">{String(item.depth ?? 0)}</Field></dl>
        {Boolean(item.requested_text) && <><h4>Requested</h4><pre dir="auto">{String(item.requested_text)}</pre></>}
        {Boolean(item.returned_text) && <><h4>Provider returned</h4><pre dir="auto">{String(item.returned_text)}</pre></>}
        {Boolean(item.error) && <p className="provider-diagnostic-error">{String(item.error)}</p>}
      </details>
    })}</div>
  </section>
}

export function ActivityDetailSheet({ run, onClose }: { run: ActivityRun | null; onClose: () => void }) {
  return <Sheet open={Boolean(run)} onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent className="activity-detail">
      {run && <><SheetHeader><SheetTitle>{run.operation}</SheetTitle><SheetDescription>{run.kind_label} · {new Date(run.when).toLocaleString()}</SheetDescription></SheetHeader>
        <div className="activity-detail-body">
          <section className="activity-cost"><span>{costBasisLabel(run.cost_basis)}</span><b>{formatMoney(run.cost)}</b><small>{run.cost_basis_raw}</small></section>
          <dl>
            <Field label="Status">{run.status}</Field><Field label="Started by">{run.actor_label}</Field>
            {run.requires_review && <Field label="Provider result">Ambiguous — review before retry</Field>}
            <Field label="Workspace">{run.organization_id}</Field><Field label="Tool">{run.source_tool}</Field>
            <Field label="Production">{run.production_name}</Field><Field label="Model">{run.model ? <SpeechModelIdentity modelId={run.model} /> : null}</Field>
            <Field label="Region">{run.provider_region}</Field><Field label="Price version">{run.price_version}</Field>
            <Field label="Provider request ID">{run.provider_request_id}</Field><Field label="Duration">{run.seconds ? `${run.seconds.toFixed(2)} seconds` : null}</Field>
          </dl>
          <section className="activity-identifiers"><h3>Identifiers</h3><code>{run.id}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(run.id).then(() => toast.success("Job ID copied."))}><Copy /> Copy Job ID</Button></section>
          {!!run.output_ids.length && <section className="activity-outputs"><h3>Outputs</h3>{run.output_ids.map((output) => <p key={`${output.type}:${output.id}`}><b>{output.type}</b> #{output.id}</p>)}</section>}
          <ProviderDiagnostics diagnostics={run.provider_diagnostics} />
          {Object.keys(run.usage || {}).length > 0 && <section><h3>Provider usage</h3><pre>{JSON.stringify(run.usage, null, 2)}</pre></section>}
          {run.error && <section className="activity-detail-error"><h3>Error</h3><p>{run.error}</p></section>}
        </div></>}
    </SheetContent>
  </Sheet>
}
