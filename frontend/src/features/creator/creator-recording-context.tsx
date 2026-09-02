import { CheckCircle2, ChevronDown, CircleAlert, Mic2 } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { CreatorPresentation } from "./creator-surface"
import { useCreator } from "./creator-controller"
import { CreatorWho } from "./creator-who"

export function CreatorRecordingContext({ presentation }: { presentation: CreatorPresentation }) {
  const creator = useCreator()
  const incomplete = !creator.selectedIdentity || !creator.currentRoute
  const [open, setOpen] = useState(false)

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cn("creator-recording-context", incomplete && "is-incomplete")}>
    <summary className="creator-recording-summary">
      <span className="creator-recording-status" aria-hidden="true">{incomplete ? <CircleAlert /> : <CheckCircle2 />}</span>
      <div className="creator-recording-primary">
        <span><Mic2 /><b>{creator.selectedIdentity?.name || "Choose a Voice"}</b></span>
        <small>{creator.currentRoute ? `${creator.methodLabel} · ${creator.currentRoute.modelId}` : "Exact recording method required"}</small>
      </div>
      <div className="creator-recording-facts"><span>{creator.language}</span><span>{creator.format.toUpperCase()}</span><span>{presentation === "mega" ? "Speak" : "Project"}</span></div>
      <span className="creator-recording-trigger">{open ? "Collapse" : incomplete ? "Complete setup" : "Edit setup"}<ChevronDown className={cn(open && "is-open")} /></span>
    </summary>
    <div className="creator-recording-content"><CreatorWho /></div>
  </details>
}
