import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatMoney } from "@/lib/format"
import { operationStatusLabel } from "@/lib/operation-language"
import { productIdentity } from "@/lib/product-identity"
import type { ActivityRun } from "@/types/domain"
import { costBasisLabel } from "./activity-run-card"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children || "Not reported"}</dd></div>
}

function ProviderDiagnostics({ diagnostics }: { diagnostics: ActivityRun["provider_diagnostics"] }) {
  if (!diagnostics.length) return null
  return <section className="provider-diagnostics">
    <h3>Provider sections</h3>
    <p>{diagnostics.length} provider request{diagnostics.length === 1 ? "" : "s"}. Replaced sections were billed but excluded from the final audio.</p>
    <div>{diagnostics.map((item, index) => {
      const status = String(item.status || "unknown")
      return <details key={`${String(item.path || index)}:${String(item.request_id || index)}`} className={status}>
        <summary><b>Section {String(item.path || index + 1)}</b><span>{status}</span><small>{item.characters ? `${String(item.characters)} characters` : "Provider request"}</small></summary>
        <dl><Field label="Finish reason">{String(item.finish_reason || "Not reported")}</Field><Field label="Request ID">{String(item.request_id || "Not reported")}</Field><Field label="Stream events">{String(item.event_count ?? "Not reported")}</Field><Field label="Depth">{String(item.depth ?? 0)}</Field></dl>
        {Boolean(item.error) && <p className="provider-diagnostic-error">{String(item.error)}</p>}
      </details>
    })}</div>
  </section>
}

export function ActivityDetailSheet({ run, onClose }: { run: ActivityRun | null; onClose: () => void }) {
  const audit = run?.record_type === "audit"
  const eventDetail = run?.event_detail || {}
  return <Sheet open={Boolean(run)} onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent className="activity-detail">
      {run && <><SheetHeader><SheetTitle>{run.operation}</SheetTitle><SheetDescription>{audit ? "Permanent action" : run.kind_label} · {new Date(run.when).toLocaleString()}</SheetDescription></SheetHeader>
        {audit ? <div className="activity-detail-body">
          <section className="activity-deletion-receipt"><span>Deletion receipt</span><b>Content permanently removed</b><p>This record proves the operator action occurred. It contains no Project name, script, audio, captions or restorable state.</p></section>
          <dl>
            <Field label="Status">Recorded</Field><Field label="Started by">{run.actor_label}</Field>
            <Field label="Workspace">{run.organization_id}</Field><Field label="Tool">{run.source_tool}</Field>
            <Field label="Parts">{String(eventDetail.parts ?? 0)}</Field><Field label="Recordings">{String(eventDetail.recordings ?? 0)}</Field>
            <Field label="Captions">{String(eventDetail.captions ?? 0)}</Field><Field label="Exports">{String(eventDetail.exports ?? 0)}</Field>
          </dl>
          <section className="activity-identifiers"><h3>Activity receipt</h3><code>{run.id}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(run.id).then(() => toast.success("Receipt ID copied."))}><Copy /> Copy receipt ID</Button></section>
        </div> : <div className="activity-detail-body">
          <section className="activity-cost"><span>{costBasisLabel(run.cost_basis)}</span><b>{formatMoney(run.cost)}</b><small>{run.cost_basis_raw}</small></section>
          <dl>
            <Field label="Status">{operationStatusLabel(run.status, run)}</Field><Field label="Started by">{run.actor_label}</Field>
            {run.requires_review && <Field label="Provider result">Ambiguous — review before retry</Field>}
            {run.needs_confirmation && <Field label="Operator action">Cost confirmation required</Field>}
            <Field label="Workspace">{run.organization_id}</Field><Field label="Tool">{run.source_tool}</Field>
            <Field label="Project">{run.project_name}</Field><Field label="Model">{run.model ? <SpeechModelIdentity modelId={run.model} /> : null}</Field>
            <Field label="Region">{run.provider_region}</Field><Field label="Price version">{run.price_version}</Field>
            <Field label="Provider request ID">{run.provider_request_id}</Field><Field label="Duration">{run.seconds ? `${run.seconds.toFixed(2)} seconds` : null}</Field>
          </dl>
          <section className="activity-identifiers"><h3>Identifiers</h3><code>{run.id}</code><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(run.id).then(() => toast.success("Job ID copied."))}><Copy /> Copy Job ID</Button></section>
          {!!run.output_ids.length && <section className="activity-outputs"><h3>Outputs</h3>{run.output_ids.map((output) => <p key={`${output.type}:${output.id}`}><b>{output.type}</b> #{output.id}</p>)}</section>}
          {Object.keys(run.review_evidence || {}).length > 0 && <section><h3>Review evidence</h3><pre>{JSON.stringify(run.review_evidence, null, 2)}</pre></section>}
          <ProviderDiagnostics diagnostics={run.provider_diagnostics} />
          {Object.keys(run.usage || {}).length > 0 && <section><h3>Provider usage</h3><pre>{JSON.stringify(run.usage, null, 2)}</pre></section>}
          {run.error && <section className="activity-detail-error"><h3>Operation problem</h3><p>{run.requires_review ? "The provider result needs an operator decision." : `${productIdentity.name} retained the failure record. Technical diagnostics are shown below for support and debugging.`}</p><details><summary>Technical error</summary><pre>{run.error}</pre></details></section>}
        </div>}</>}
    </SheetContent>
  </Sheet>
}
