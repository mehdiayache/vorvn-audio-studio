import { Expand, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"
import { ComposerActions } from "./composer-actions"
import type { ComposerController } from "./composer-controller"
import { ComposerDialogs } from "./composer-dialogs"
import { ComposerOutput } from "./composer-output"
import { ComposerPerformance } from "./composer-performance"
import { ComposerProvider, type ComposerSurfaceProps, useComposerController } from "./composer-controller"
import { ComposerRecordingContext } from "./composer-recording-context"
import { ComposerRoleEditor } from "./composer-role-editor"
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
          <span className="eyebrow">{standalone ? "Speak" : "Project recording"}</span>
          <b>{standalone ? "Generate standalone audio" : composer.destination}</b>
          <small>{standalone ? "Choose a voice, shape the delivery, then listen in this session" : "Voice, script, and performance in one workspace"}</small>
        </div>
        <div className="composer-context-actions">
          {!standalone && <ComposerRoleEditor composer={composer} />}
          {presentation === "inline" && onExpand && <Button variant="outline" size="sm" onClick={onExpand}><Expand /> Expand</Button>}
          {onClose && <OperatorIconButton label="Close Composer" detail="Keeps the saved preparation and returns to the Project." onClick={onClose}><X /></OperatorIconButton>}
        </div>
      </header>
      {workstation ? <div className="composer-workspace">
        <ComposerWho />
        <div className="composer-creative-workspace">
          <main className="composer-script-canvas" aria-label="Script canvas">
            <ComposerWords />
          </main>
          <aside className="composer-controls-rail" aria-label="Sound and output">
            <ComposerPerformance />
            <ComposerOutput />
          </aside>
        </div>
      </div> : <div className="composer-stage">
        <ComposerRecordingContext presentation={presentation} />
        <div className="composer-stage-flow">
          <div className="composer-stage-script"><ComposerWords /></div>
          <div className="composer-stage-settings-grid" aria-label="Performance and output settings">
            <ComposerPerformance />
            <ComposerOutput />
          </div>
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
