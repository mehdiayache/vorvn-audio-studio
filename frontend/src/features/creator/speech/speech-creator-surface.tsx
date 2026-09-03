import { Expand, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"
import { SpeechCreatorActions } from "./speech-creator-actions"
import { SpeechCreatorDialogs } from "./speech-creator-dialogs"
import { SpeechOutputControls } from "./speech-output-controls"
import { SpeechPerformanceControls } from "./speech-performance-controls"
import { SpeechRoleEditor } from "./speech-role-editor"
import { SpeechCreationRoute } from "./speech-creation-route"
import { SpeechScriptEditor } from "./speech-script-editor"
import { CreatorCapabilityBody, CreatorCapabilityPanel, CreatorDisclosure } from "../panel/creator-capability-panel"
import type { SpeechCreatorController } from "./speech-creator-controller"
import { SpeechCreatorProvider, type SpeechCreatorSurfaceProps, useSpeechCreatorController } from "./speech-creator-controller"

import "./speech-creator.css"

export type SpeechCreatorPresentation = "inline" | "stage" | "mega" | "dialog" | "panel"

export function ControlledSpeechCreatorSurface({ creator, presentation = "mega", onExpand, onClose }: {
  creator: SpeechCreatorController
  presentation?: SpeechCreatorPresentation
  onExpand?: () => void
  onClose?: () => void
}) {
  const standalone = presentation === "mega"
  const workstation = standalone || presentation === "dialog"
  const panel = presentation === "panel"
  const capabilityPanel = panel || presentation === "stage"
  return <SpeechCreatorProvider value={creator}>
    <div className={cn("speech-creator creator-surface", `is-${presentation}`)}>
      {!panel && <header className="creator-context-bar">
        <div className="creator-context-copy">
          <span className="eyebrow">Creator</span>
          <b>{standalone ? "Speech" : `Speech · ${creator.destination}`}</b>
          <small>{standalone ? "Choose a voice, shape the delivery, then listen in this session" : "The same Speech Creator, working in the current Script context"}</small>
        </div>
        <div className="creator-context-actions">
          {!standalone && <SpeechRoleEditor creator={creator} />}
          {presentation === "inline" && onExpand && <Button variant="outline" size="sm" onClick={onExpand}><Expand /> Expand</Button>}
          {onClose && <OperatorIconButton label="Close Creator" detail="Keeps the saved preparation and returns to the Project." onClick={onClose}><X /></OperatorIconButton>}
        </div>
      </header>}
      {capabilityPanel ? <CreatorCapabilityPanel className="speech-capability-panel">
        <CreatorCapabilityBody className="speech-capability-body">
          <SpeechCreationRoute />
          <SpeechScriptEditor />
          <CreatorDisclosure title="Performance" detail="Delivery, direction and fine controls">
            <SpeechPerformanceControls />
          </CreatorDisclosure>
          <CreatorDisclosure title="Output" detail="File format and exact route">
            <SpeechOutputControls />
          </CreatorDisclosure>
        </CreatorCapabilityBody>
        <SpeechCreatorActions capabilityPanel />
      </CreatorCapabilityPanel> : workstation ? <div className="creator-workspace">
        <SpeechCreationRoute />
        <div className="creator-creative-workspace">
          <main className="creator-script-canvas" aria-label="Script canvas">
            <SpeechScriptEditor />
          </main>
          <aside className="creator-controls-rail" aria-label="Sound and output">
            <SpeechPerformanceControls />
            <SpeechOutputControls />
          </aside>
        </div>
      </div> : <div className="creator-stage">
        <SpeechCreationRoute />
        <div className="creator-stage-flow">
          <div className="creator-stage-script"><SpeechScriptEditor /></div>
          <div className="creator-stage-settings-grid" aria-label="Performance and output settings">
            <SpeechPerformanceControls />
            <SpeechOutputControls />
          </div>
        </div>
      </div>}
      {!capabilityPanel && <SpeechCreatorActions />}
      <SpeechCreatorDialogs />
    </div>
  </SpeechCreatorProvider>
}

export function SpeechCreatorSurface(props: SpeechCreatorSurfaceProps & { presentation?: SpeechCreatorPresentation; onExpand?: () => void; onClose?: () => void }) {
  const creator = useSpeechCreatorController(props)
  return <ControlledSpeechCreatorSurface creator={creator} presentation={props.presentation} onExpand={props.onExpand} onClose={props.onClose} />
}
