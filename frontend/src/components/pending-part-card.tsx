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
  useEffect(() => { if (task.status !== "generating") return; const timer = window.setInterval(() => tick((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [task.status])
  const failed = task.status === "failed"
  return <div className="sequence-row pending-row">
    <div className="sequence-node-column"><span className={`sequence-row-node ${failed ? "issue" : "pending"}`}>{String(index + 1).padStart(2, "0")}</span></div>
    <article className={`sequence-card pending-card ${failed ? "failed" : "generating"}`} aria-label={failed ? "Speech generation failed" : "Speech is generating"} role="status" aria-live="polite">
      <div className="pending-card-icon">{failed ? <CircleAlert /> : <LoaderCircle className="spin" />}</div>
      <div className="pending-card-body">
        <div className="sequence-card-heading"><VoiceIdentity voice={task.voice} identityId={task.payload.voice_identity_id} directory={directory} compact /><span className="pending-card-status"><b>{failed ? "Generation failed" : "Generating audio…"}</b><small>{failed ? task.error || "The provider did not finish this Part." : `${elapsed(task.startedAt)} · safe to continue working`}</small></span></div>
        <div className="pending-route"><SpeechRouteLabel route={task.payload} includeLanguage /></div>
        <p dir={textDirection(task.text)}>{clipText(task.text, 190)}</p>
        {!failed && <div className="pending-waveform" aria-hidden="true">{Array.from({ length: 36 }, (_, bar) => <i style={{ height: `${24 + ((bar * 17) % 66)}%` }} key={bar} />)}</div>}
      </div>
      {failed && <div className="pending-card-actions"><Button variant="outline" size="sm" onClick={() => onRetry(task)}><RefreshCw /> Retry</Button><Button variant="ghost" size="icon" aria-label="Dismiss failed generation" onClick={() => onDismiss(task.id)}><X /></Button></div>}
    </article>
  </div>
}
