import { Check, CircleAlert, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VoicePackageJob, VoicePackageRoute, VoiceProfileBinding } from "@/types/domain"

function stateFor(route: VoicePackageRoute, bindings: VoiceProfileBinding[], jobs: VoicePackageJob[]) {
  const binding = bindings.find((item) => item.model_id === route.model_id)
  if (binding) return { status: "ready", detail: "Ready", binding }
  const job = jobs.find((item) => item.model_id === route.model_id)
  if (job) return { status: job.status, detail: job.status === "creating" ? "Creating at Alibaba" : job.status === "queued" ? "Waiting to start" : job.status === "failed" ? job.error || "Creation failed" : job.status === "interrupted" ? "Interrupted · ready to retry" : job.status }
  return { status: "missing", detail: "Not created" }
}

function capabilityName(route: VoicePackageRoute) {
  if (route.engine === "audio") return "Exact reading"
  return route.tier === "flash" ? "Fast performance" : "Directed performance"
}

export function VoiceCapabilityList({ routes, bindings, jobs, onRetry }: {
  routes: VoicePackageRoute[]
  bindings: VoiceProfileBinding[]
  jobs: VoicePackageJob[]
  onRetry?: (modelId: string) => void
}) {
  return <div className="voice-capability-list">{routes.map((route) => {
    const state = stateFor(route, bindings, jobs)
    return <article key={route.model_id} className={`voice-capability voice-capability-${state.status}`}>
      <span className="voice-capability-state">{state.status === "ready" ? <Check /> : ["queued", "creating"].includes(state.status) ? <LoaderCircle className="spin" /> : state.status === "failed" || state.status === "interrupted" ? <CircleAlert /> : <span />}</span>
      <div><b>{capabilityName(route)}</b><small>{route.role} · {route.label}</small><span>{state.detail}</span></div>
      {(state.status === "failed" || state.status === "interrupted") && onRetry && <Button variant="outline" size="sm" onClick={() => onRetry(route.model_id)}><RotateCw /> Retry</Button>}
    </article>
  })}</div>
}
