import { Check, CircleAlert, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VoicePackageJob, VoicePackageRoute, VoiceProfileBinding } from "@/types/domain"

function stateFor(route: VoicePackageRoute, bindings: VoiceProfileBinding[], jobs: VoicePackageJob[], sourceAvailable: boolean) {
  const binding = bindings.find((item) => item.model_id === route.model_id)
  if (binding) return { status: "ready", detail: "Ready", binding }
  const job = jobs.find((item) => item.model_id === route.model_id)
  if (job) return { status: job.status, detail: job.status === "creating" ? "Creating at Alibaba" : job.status === "queued" ? "Waiting to start" : job.status === "failed" ? job.error || "Creation failed" : job.status === "interrupted" ? "Interrupted · ready to retry" : job.status }
  return { status: "missing", detail: sourceAvailable ? "Not created" : "Source recording needed" }
}

function capabilityName(route: VoicePackageRoute) {
  if (route.engine === "audio") return "Expressive + tags"
  if (route.engine === "qwen_tts") return "Clean long reading"
  return "Arabic & multilingual"
}

export function VoiceCapabilityList({ routes, bindings, jobs, sourceAvailable = true, onRetry }: {
  routes: VoicePackageRoute[]
  bindings: VoiceProfileBinding[]
  jobs: VoicePackageJob[]
  sourceAvailable?: boolean
  onRetry?: (modelId: string) => void
}) {
  return <div className="voice-capability-list">{routes.map((route) => {
    const state = stateFor(route, bindings, jobs, sourceAvailable)
    const languages = state.binding?.languages || route.documented_output_languages || []
    return <article key={route.model_id} className={`voice-capability voice-capability-${state.status}`}>
      <span className="voice-capability-state">{state.status === "ready" ? <Check /> : ["queued", "creating"].includes(state.status) ? <LoaderCircle className="spin" /> : state.status === "failed" || state.status === "interrupted" ? <CircleAlert /> : <span />}</span>
      <div><b>{capabilityName(route)}</b><small>{route.role} · {route.label}</small>{languages.length > 0 && <details className="voice-capability-languages"><summary>{languages.length} documented output language{languages.length === 1 ? "" : "s"}</summary><p>{languages.join(" · ")}</p></details>}<span>{state.detail}</span></div>
      {(state.status === "failed" || state.status === "interrupted") && onRetry && <Button variant="outline" size="sm" onClick={() => onRetry(route.model_id)}><RotateCw /> Retry</Button>}
    </article>
  })}</div>
}
