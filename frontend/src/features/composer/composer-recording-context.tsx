import { CheckCircle2, ChevronDown, CircleAlert, Mic2 } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { ComposerPresentation } from "./composer-surface"
import { useComposer } from "./composer-controller"
import { ComposerWho } from "./composer-who"

export function ComposerRecordingContext({ presentation }: { presentation: ComposerPresentation }) {
  const composer = useComposer()
  const incomplete = !composer.selectedIdentity || !composer.currentRoute
  const [open, setOpen] = useState(false)

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cn("composer-recording-context", incomplete && "is-incomplete")}>
    <summary className="composer-recording-summary">
      <span className="composer-recording-status" aria-hidden="true">{incomplete ? <CircleAlert /> : <CheckCircle2 />}</span>
      <div className="composer-recording-primary">
        <span><Mic2 /><b>{composer.selectedIdentity?.name || "Choose a Voice"}</b></span>
        <small>{composer.currentRoute ? `${composer.methodLabel} · ${composer.currentRoute.modelId}` : "Exact recording method required"}</small>
      </div>
      <div className="composer-recording-facts"><span>{composer.language}</span><span>{composer.format.toUpperCase()}</span><span>{presentation === "mega" ? "Speak" : "Production"}</span></div>
      <span className="composer-recording-trigger">{open ? "Collapse" : incomplete ? "Complete setup" : "Edit setup"}<ChevronDown className={cn(open && "is-open")} /></span>
    </summary>
    <div className="composer-recording-content"><ComposerWho /></div>
  </details>
}
