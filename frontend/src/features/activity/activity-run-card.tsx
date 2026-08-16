import { AlertTriangle, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react"

import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { formatMoney } from "@/lib/format"
import { operatorErrorMessage, operationStatusLabel } from "@/lib/operation-language"
import type { ActivityRun } from "@/types/domain"

export function costBasisLabel(basis: string) {
  return ({ actual_usage: "Provider usage", catalog_usage: "Catalogue usage", mixed_usage: "Mixed usage",
    estimate: "Estimate", not_billed: "Not billed",
    historical_unknown: "Historical" } as Record<string, string>)[basis] || "Unknown"
}

export function ActivityRunCard({ run, onOpen }: { run: ActivityRun; onOpen: () => void }) {
  const audit = run.record_type === "audit"
  const healthy = run.status === "ok"
  const active = ["queued", "running", "retrying"].includes(run.status)
  const Icon = audit ? Trash2 : active ? LoaderCircle : healthy ? CheckCircle2 : AlertTriangle
  return <button className={`activity-run ${run.status}${audit ? " audit" : ""}`} onClick={onOpen}>
    <span className="activity-run-icon"><Icon className={active ? "spin" : ""} /></span>
    <div className="activity-run-copy">
      <header><b>{run.operation}</b><span>{audit ? "Recorded" : operationStatusLabel(run.status, run)}</span></header>
      <p>{audit ? run.detail : run.production_name || run.kind_label} · {run.actor_label}</p>
      {!audit && run.model && <SpeechModelIdentity modelId={run.model} compact />}
      {run.error && <em>{operatorErrorMessage(run.error)}</em>}
      <footer><span>{new Date(run.when).toLocaleString()}</span><span>{audit ? "Permanent action" : costBasisLabel(run.cost_basis)}</span><span className="activity-id">{run.id.slice(0, 8)}</span></footer>
    </div>
    <strong>{audit ? "Permanent" : formatMoney(run.cost)}</strong>
  </button>
}
