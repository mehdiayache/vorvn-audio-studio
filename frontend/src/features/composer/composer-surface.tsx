import { Expand, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ComposerActions } from "./composer-actions"
import type { ComposerController } from "./composer-controller"
import { ComposerDialogs } from "./composer-dialogs"
import { ComposerOutput } from "./composer-output"
import { ComposerPerformance } from "./composer-performance"
import { ComposerProvider, type ComposerSurfaceProps, useComposerController } from "./composer-controller"
import { ComposerRecordingContext } from "./composer-recording-context"
import { ComposerWho } from "./composer-who"
import { ComposerWords } from "./composer-words"

import "./composer.css"

export type ComposerPresentation = "inline" | "stage" | "mega" | "dialog"

export function ControlledComposerSurface({ composer, presentation = "mega", onExpand, onClose }: {
  composer: ComposerController
  presentation?: ComposerPresentation
  onExpand?: () => void
  onClose?: () => void
}) {
  const standalone = presentation === "mega"
  const workstation = standalone || presentation === "dialog"
  return <ComposerProvider value={composer}>
    <div className={cn("speech-composer composer-surface", `is-${presentation}`)}>
      <header className="composer-context-bar">
        <div className="composer-context-copy">
          <span className="eyebrow">{standalone ? "Create" : "Production recording"}</span>
          <b>{standalone ? "New recording" : composer.destination}</b>
          <small>{standalone ? "Prepare the voice, words, and delivery" : "Voice, script, and performance in one workspace"}</small>
        </div>
        <div className="composer-context-actions">
          {presentation === "inline" && onExpand && <Button variant="outline" size="sm" onClick={onExpand}><Expand /> Expand</Button>}
          {onClose && <Button variant="ghost" size="icon-sm" aria-label="Close Composer" onClick={onClose}><X /></Button>}
        </div>
      </header>
      {workstation ? <div className="composer-workspace">
        <aside className="composer-setup-rail" aria-label="Voice and recording method">
          <ComposerWho />
        </aside>
        <main className="composer-script-canvas" aria-label="Script canvas">
          <ComposerWords />
        </main>
        <aside className="composer-controls-rail" aria-label="Performance and output">
          <ComposerPerformance />
          <ComposerOutput />
        </aside>
      </div> : <div className="composer-stage">
        <ComposerRecordingContext presentation={presentation} />
        <ComposerWords />
        <div className="composer-disclosure-grid">
          <details className="composer-disclosure">
            <summary><span><b>Performance</b><small>{composer.methodLabel}</small></span><span>Voice direction and supported controls</span></summary>
            <ComposerPerformance />
          </details>
          <details className="composer-disclosure">
            <summary><span><b>Output</b><small>{composer.format.toUpperCase()}</small></span><span>Exact model and file settings</span></summary>
            <ComposerOutput />
          </details>
        </div>
      </div>}
      <ComposerActions />
      <ComposerDialogs />
    </div>
  </ComposerProvider>
}

export function ComposerSurface(props: ComposerSurfaceProps & { presentation?: ComposerPresentation; onExpand?: () => void; onClose?: () => void }) {
  const composer = useComposerController(props)
  return <ControlledComposerSurface composer={composer} presentation={props.presentation} onExpand={props.onExpand} onClose={props.onClose} />
}
