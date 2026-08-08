import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react"

import { formatMoney } from "@/lib/format"
import type { ActivityRun } from "@/types/domain"

export function costBasisLabel(basis: string) {
  return ({ actual_usage: "Provider usage", catalog_usage: "Catalogue usage",
    estimate: "Estimate", not_billed: "Not billed",
    historical_unknown: "Historical" } as Record<string, string>)[basis] || "Unknown"
}

export function ActivityRunCard({ run, onOpen }: { run: ActivityRun; onOpen: () => void }) {
  const healthy = run.status === "ok"
  const active = ["queued", "running", "retrying"].includes(run.status)
  const Icon = active ? LoaderCircle : healthy ? CheckCircle2 : AlertTriangle
  return <button className={`activity-run ${run.status}`} onClick={onOpen}>
    <span className="activity-run-icon"><Icon className={active ? "spin" : ""} /></span>
    <div className="activity-run-copy">
      <header><b>{run.operation}</b><span>{run.status}</span></header>
      <p>{run.production_name || run.kind_label} · {run.actor_label}</p>
      {run.error && <em>{run.error}</em>}
      <footer><span>{new Date(run.when).toLocaleString()}</span><span>{costBasisLabel(run.cost_basis)}</span><span className="activity-id">{run.id.slice(0, 8)}</span></footer>
    </div>
    <strong>{formatMoney(run.cost)}</strong>
  </button>
}
