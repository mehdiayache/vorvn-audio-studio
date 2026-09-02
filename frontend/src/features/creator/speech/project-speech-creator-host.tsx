import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { createPortal } from "react-dom"

import { MobileCreatorTransport } from "../mobile-creator-transport"
import { type SpeechCreatorSurfaceProps, useSpeechCreatorController } from "./speech-creator-controller"
import { SpeechCreatorSurface, ControlledSpeechCreatorSurface, type SpeechCreatorPresentation } from "./speech-creator-surface"

export function ProjectSpeechCreatorStage(props: SpeechCreatorSurfaceProps) {
  return <div className="project-creator-stage"><SpeechCreatorSurface {...props} presentation="stage" visible /></div>
}

export function ProjectSpeechCreatorSession({ target, presentation, onExpand, onClose, ...props }: SpeechCreatorSurfaceProps & {
  target: HTMLElement | null
  presentation: Extract<SpeechCreatorPresentation, "inline" | "stage">
  onExpand: () => void
  onClose: () => void
}) {
  const creator = useSpeechCreatorController({ ...props, visible: true })
  if (!target) return null
  return createPortal(<ControlledSpeechCreatorSurface creator={creator} presentation={presentation} onExpand={onExpand} onClose={presentation === "inline" ? onClose : undefined} />, target)
}

export function ProjectSpeechCreatorDialog({ title, description, onClose, ...creatorProps }: SpeechCreatorSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="project-creator-dialog" showCloseButton={false}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description} Closing this window does not cancel a running Job.</DialogDescription>
      </DialogHeader>
      <SpeechCreatorSurface {...creatorProps} presentation="dialog" onClose={onClose} />
    </DialogContent>
  </Dialog>
}

export function MobileProjectSpeechCreatorSheet({ title, description, onClose, ...creatorProps }: SpeechCreatorSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent side="bottom" className="creator-mobile-sheet" showCloseButton>
      <SheetHeader className="creator-mobile-sheet-header">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description} Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <SpeechCreatorSurface {...creatorProps} />
      <MobileCreatorTransport active />
    </SheetContent>
  </Sheet>
}
