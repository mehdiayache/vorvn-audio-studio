import { Expand, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"
import { CreatorActions } from "./creator-actions"
import type { CreatorController } from "./creator-controller"
import { CreatorDialogs } from "./creator-dialogs"
import { CreatorOutput } from "./creator-output"
import { CreatorPerformance } from "./creator-performance"
import { CreatorProvider, type CreatorSurfaceProps, useCreatorController } from "./creator-controller"
import { CreatorRecordingContext } from "./creator-recording-context"
import { CreatorRoleEditor } from "./creator-role-editor"
import { CreatorWho } from "./creator-who"
import { CreatorWords } from "./creator-words"

import "./creator.css"

export type CreatorPresentation = "inline" | "stage" | "mega" | "dialog"

export function ControlledCreatorSurface({ creator, presentation = "mega", onExpand, onClose }: {
  creator: CreatorController
  presentation?: CreatorPresentation
  onExpand?: () => void
  onClose?: () => void
}) {
  const standalone = presentation === "mega"
  const workstation = standalone || presentation === "dialog"
  return <CreatorProvider value={creator}>
    <div className={cn("speech-creator creator-surface", `is-${presentation}`)}>
      <header className="creator-context-bar">
        <div className="creator-context-copy">
          <span className="eyebrow">{standalone ? "Speak" : "Project recording"}</span>
          <b>{standalone ? "Generate standalone audio" : creator.destination}</b>
          <small>{standalone ? "Choose a voice, shape the delivery, then listen in this session" : "Voice, script, and performance in one workspace"}</small>
        </div>
        <div className="creator-context-actions">
          {!standalone && <CreatorRoleEditor creator={creator} />}
          {presentation === "inline" && onExpand && <Button variant="outline" size="sm" onClick={onExpand}><Expand /> Expand</Button>}
          {onClose && <OperatorIconButton label="Close Creator" detail="Keeps the saved preparation and returns to the Project." onClick={onClose}><X /></OperatorIconButton>}
        </div>
      </header>
      {workstation ? <div className="creator-workspace">
        <CreatorWho />
        <div className="creator-creative-workspace">
          <main className="creator-script-canvas" aria-label="Script canvas">
            <CreatorWords />
          </main>
          <aside className="creator-controls-rail" aria-label="Sound and output">
            <CreatorPerformance />
            <CreatorOutput />
          </aside>
        </div>
      </div> : <div className="creator-stage">
        <CreatorRecordingContext presentation={presentation} />
        <div className="creator-stage-flow">
          <div className="creator-stage-script"><CreatorWords /></div>
          <div className="creator-stage-settings-grid" aria-label="Performance and output settings">
            <CreatorPerformance />
            <CreatorOutput />
          </div>
        </div>
      </div>}
      <CreatorActions />
      <CreatorDialogs />
    </div>
  </CreatorProvider>
}

export function CreatorSurface(props: CreatorSurfaceProps & { presentation?: CreatorPresentation; onExpand?: () => void; onClose?: () => void }) {
  const creator = useCreatorController(props)
  return <ControlledCreatorSurface creator={creator} presentation={props.presentation} onExpand={props.onExpand} onClose={props.onClose} />
}
