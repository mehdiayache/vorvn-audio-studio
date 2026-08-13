import { CheckCircle2, ChevronDown, CircleAlert, Mic2 } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import type { ComposerPresentation } from "./composer-surface"
import { useComposer } from "./composer-controller"
import { ComposerWho } from "./composer-who"

export function ComposerRecordingContext({ presentation }: { presentation: ComposerPresentation }) {
  const composer = useComposer()
  const incomplete = !composer.selectedIdentity || !composer.currentRoute
  const [open, setOpen] = useState(incomplete)
  useEffect(() => { if (incomplete) setOpen(true) }, [incomplete])

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cn("composer-recording-context", incomplete && "is-incomplete")}>
    <summary className="composer-recording-summary">
      <span className="composer-recording-status" aria-hidden="true">{incomplete ? <CircleAlert /> : <CheckCircle2 />}</span>
      <div className="composer-recording-primary">
        <span><Mic2 /><b>{composer.selectedIdentity?.name || "Choose a Voice"}</b>{composer.selectedCastRole && <em>{composer.selectedCastRole.name}</em>}</span>
        <small>{composer.currentRoute ? `${composer.methodLabel} · ${composer.currentRoute.modelId}` : "Exact recording method required"}</small>
      </div>
      <div className="composer-recording-facts"><span>{composer.language}</span><span>{composer.format.toUpperCase()}</span><span>{presentation === "inline" ? "Inline" : presentation === "workbench" ? "Workbench" : "Speak"}</span></div>
      <span className="composer-recording-trigger">{open ? "Hide setup" : incomplete ? "Complete setup" : "Change setup"}<ChevronDown className={cn(open && "is-open")} /></span>
    </summary>
    <div className="composer-recording-content"><ComposerWho /></div>
  </details>
}
