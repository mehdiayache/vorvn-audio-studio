import { CircleAlert, LoaderCircle, RefreshCw, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { VoiceIdentity } from "@/components/voice-identity"
import { SpeechRouteLabel } from "@/components/speech-route-label"
import { clipText, textDirection } from "@/lib/format"
import type { RenderTask, VoiceDirectory } from "@/types/domain"

function elapsed(startedAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function PendingPartCard({ task, index, directory, onRetry, onDismiss }: {
  task: RenderTask
  index: number
  directory: VoiceDirectory
  onRetry: (task: RenderTask) => void
  onDismiss: (id: string) => void
}) {
  const [, tick] = useState(0)
  const working = ["queued", "running", "retrying"].includes(task.status)
  useEffect(() => { if (!working) return; const timer = window.setInterval(() => tick((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [working])
  const failed = ["failed", "lost", "cancelled"].includes(task.status)
  const review = task.status === "blocked"
  return <div className="sequence-row pending-row">
    <div className="sequence-node-column"><span className={`sequence-row-node ${failed ? "issue" : "pending"}`}>{String(index + 1).padStart(2, "0")}</span></div>
    <article className={`sequence-card pending-card ${failed || review ? "failed" : "generating"}`} aria-label={failed ? "Speech generation failed" : review ? "Speech generation needs review" : "Speech is generating"} role="status" aria-live="polite">
      <div className="pending-card-icon">{failed || review ? <CircleAlert /> : <LoaderCircle className="spin" />}</div>
      <div className="pending-card-body">
        <div className="sequence-card-heading"><VoiceIdentity voice={task.voice} identityId={task.payload.voice_identity_id} directory={directory} compact /><span className="pending-card-status"><b>{failed ? "Generation failed" : review ? "Review required" : "Generating audio…"}</b><small>{failed ? task.error || "The provider did not finish this Part." : review ? task.detail || "Open Activity before trying this paid operation again." : `${elapsed(task.startedAt)} · ${task.detail || "safe to continue working"}`}</small></span></div>
        <div className="pending-route"><SpeechRouteLabel route={task.payload} includeLanguage config={directory.config} /></div>
        <p dir={textDirection(task.text)}>{clipText(task.text, 190)}</p>
        {working && <div className="pending-waveform" aria-hidden="true">{Array.from({ length: 36 }, (_, bar) => <i style={{ height: `${24 + ((bar * 17) % 66)}%` }} key={bar} />)}</div>}
      </div>
      {(failed || review) && <div className="pending-card-actions">{failed && <Button variant="outline" size="sm" onClick={() => onRetry(task)}><RefreshCw /> Retry</Button>}<Button variant="ghost" size="icon" aria-label="Dismiss generation" onClick={() => onDismiss(task.jobId)}><X /></Button></div>}
    </article>
  </div>
}
