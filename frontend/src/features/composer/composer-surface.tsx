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
import { ComposerWords } from "./composer-words"

import "./composer.css"

export type ComposerPresentation = "inline" | "stage" | "mega"

export function ControlledComposerSurface({ composer, presentation = "mega", onExpand, onClose }: {
  composer: ComposerController
  presentation?: ComposerPresentation
  onExpand?: () => void
  onClose?: () => void
}) {
  return <ComposerProvider value={composer}>
    <div className={cn("speech-composer composer-surface", `is-${presentation}`)}>
      <header className="composer-context-bar">
        <div><span className="eyebrow">Recording context</span><b>{composer.destination}</b></div>
        <div className="composer-context-actions">
          {presentation === "inline" && onExpand && <Button variant="outline" size="sm" onClick={onExpand}><Expand /> Expand</Button>}
          {onClose && <Button variant="ghost" size="icon-sm" aria-label="Close Composer" onClick={onClose}><X /></Button>}
        </div>
      </header>
      <div className="composer-stage">
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
      </div>
      <ComposerActions />
      <ComposerDialogs />
    </div>
  </ComposerProvider>
}

export function ComposerSurface(props: ComposerSurfaceProps & { presentation?: ComposerPresentation; onExpand?: () => void; onClose?: () => void }) {
  const composer = useComposerController(props)
  return <ControlledComposerSurface composer={composer} presentation={props.presentation} onExpand={props.onExpand} onClose={props.onClose} />
}
