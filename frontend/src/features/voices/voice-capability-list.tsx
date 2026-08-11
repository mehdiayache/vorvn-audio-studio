import { Check, CircleAlert, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { languageDisplay } from "@/lib/voice"
import type { VoicePackageJob, VoicePackageRoute, VoiceProfileBinding } from "@/types/domain"

type CapabilityState = {
  status: string
  detail: string
  binding?: VoiceProfileBinding
  job?: VoicePackageJob
}

function stateFor(route: VoicePackageRoute, bindings: VoiceProfileBinding[], jobs: VoicePackageJob[], sourceAvailable: boolean): CapabilityState {
  const binding = bindings.find((item) => item.model_id === route.model_id)
  if (binding) return { status: "ready", detail: "Ready", binding }
  const job = jobs.find((item) => item.model_id === route.model_id)
  if (job) {
    const unsupported = job.status === "failed" && /unsupported language:\s*([a-z-]+)/i.exec(job.error || "")
    if (unsupported) {
      const detected = languageDisplay(unsupported[1] || "")
      return {
        status: "needs-reference",
        detail: `Alibaba identified ${detected} in this saved reference; ${route.label} cannot register that source language.`,
      }
    }
    return { status: job.status, detail: job.status === "creating" ? "Creating at Alibaba" : job.status === "queued" ? "Waiting to start" : job.status === "failed" ? "Provider setup failed" : job.status === "interrupted" ? "Interrupted · ready to retry" : job.status, job }
  }
  return { status: "missing", detail: sourceAvailable ? "Not created" : "Source recording needed" }
}

function capabilityName(route: VoicePackageRoute) {
  if (route.engine === "audio") return "Expressive speech + tags"
  if (route.engine === "qwen_tts") return "Exact long reading"
  return "Natural performance"
}

export function VoiceCapabilityList({ routes, bindings, jobs, sourceAvailable = true, onRetry }: {
  routes: VoicePackageRoute[]
  bindings: VoiceProfileBinding[]
  jobs: VoicePackageJob[]
  sourceAvailable?: boolean
  onRetry?: (enrollmentJobId: string) => void
}) {
  return <div className="voice-capability-list">{routes.map((route) => {
    const state = stateFor(route, bindings, jobs, sourceAvailable)
    const languages = state.binding?.languages || route.documented_output_languages || []
    const retryJobId = state.job?.id
    return <article key={route.model_id} className={`voice-capability voice-capability-${state.status}`}>
      <span className="voice-capability-state">{state.status === "ready" ? <Check /> : ["queued", "creating"].includes(state.status) ? <LoaderCircle className="spin" /> : ["failed", "interrupted", "needs-reference"].includes(state.status) ? <CircleAlert /> : <span />}</span>
      <div><b>{capabilityName(route)}</b><small>{route.role} · {route.label}</small>{languages.length > 0 && <details className="voice-capability-languages"><summary>{languages.length} documented output language{languages.length === 1 ? "" : "s"}</summary><p>{languages.join(" · ")}</p></details>}<span>{state.detail}</span></div>
      {(state.status === "failed" || state.status === "interrupted") && retryJobId && onRetry && <Button variant="outline" size="sm" onClick={() => onRetry(retryJobId)}><RotateCw /> Retry</Button>}
    </article>
  })}</div>
}
