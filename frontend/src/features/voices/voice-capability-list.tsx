import { Check, CircleAlert, LoaderCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { VoicePackageJob, VoicePackageRoute, VoiceProfileBinding, VoiceProfile } from "@/types/domain"
import { bindingMatchesRoute, jobMatchesRoute, referenceName } from "./voice-route"

function jobLabel(job: VoicePackageJob) {
  if (job.status === "creating") return "Creating at provider"
  if (job.status === "queued") return "Waiting to start"
  if (job.status === "failed") return "Provider setup failed"
  if (job.status === "interrupted") return "Interrupted · explicit retry available"
  return job.status
}

export function VoiceCapabilityList({ routes, bindings, jobs, references, sourceAvailable = true, onRetry }: {
  routes: VoicePackageRoute[]
  bindings: VoiceProfileBinding[]
  jobs: VoicePackageJob[]
  references: VoiceProfile["references"]
  sourceAvailable?: boolean
  onRetry?: (enrollmentJobId: string) => void
}) {
  return <div className="voice-capability-list">{routes.map((route) => {
    const exactBindings = bindings.filter((binding) => bindingMatchesRoute(binding, route))
    const exactJobs = jobs.filter((job) =>
      jobMatchesRoute(job, route) && job.status !== "ready")
    const working = exactJobs.some((job) => ["queued", "creating"].includes(job.status))
    const failed = exactJobs.some((job) => ["failed", "interrupted"].includes(job.status))
    const status = exactBindings.length ? "ready" : working ? "creating" : failed ? "failed" : "missing"
    return <article key={route.provider_model_id} className={`voice-capability voice-capability-${status}`}>
      <span className="voice-capability-state">{exactBindings.length ? <Check /> : working ? <LoaderCircle className="spin" /> : failed ? <CircleAlert /> : <span />}</span>
      <div className="voice-capability-content">
        <b>{route.role}</b>
        <small>{route.provider} · {route.label} · {route.region}</small>
        {route.documented_output_languages.length > 0 && <details className="voice-capability-languages"><summary>{route.documented_output_languages.length} documented output language{route.documented_output_languages.length === 1 ? "" : "s"}</summary><p>{route.documented_output_languages.join(" · ")}</p></details>}
        <div className="voice-binding-variants">
          {exactBindings.map((binding) => <span className="voice-binding-variant" key={binding.binding_id}><Check /><span><b>Ready binding</b><small>Reference: {referenceName(binding.reference_id, references)}</small></span></span>)}
          {exactJobs.map((job) => <span className={`voice-binding-variant voice-binding-job voice-binding-job-${job.status}`} key={job.id}>{["queued", "creating"].includes(job.status) ? <LoaderCircle className="spin" /> : ["failed", "interrupted"].includes(job.status) ? <CircleAlert /> : <Check />}<span><b>{jobLabel(job)}</b><small>Reference: {referenceName(job.reference_id, references)}</small></span>{["failed", "interrupted"].includes(job.status) && onRetry && <Button variant="outline" size="sm" onClick={() => onRetry(job.id)}><RotateCw /> Retry</Button>}</span>)}
          {!exactBindings.length && !exactJobs.length && <span className="voice-binding-empty">{sourceAvailable ? "No binding created for this provider model" : "Source recording needed"}</span>}
        </div>
      </div>
    </article>
  })}</div>
}
