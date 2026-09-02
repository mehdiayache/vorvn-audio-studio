import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { createPortal } from "react-dom"

import { type CreatorSurfaceProps, useCreatorController } from "./creator-controller"
import { CreatorSurface, ControlledCreatorSurface, type CreatorPresentation } from "./creator-surface"
import { MobileCreatorTransport } from "./mobile-creator-transport"

export function ProjectCreatorStage(props: CreatorSurfaceProps) {
  return <div className="project-creator-stage"><CreatorSurface {...props} presentation="stage" visible /></div>
}

export function ProjectCreatorSession({ target, presentation, onExpand, onClose, ...props }: CreatorSurfaceProps & {
  target: HTMLElement | null
  presentation: Extract<CreatorPresentation, "inline" | "stage">
  onExpand: () => void
  onClose: () => void
}) {
  const creator = useCreatorController({ ...props, visible: true })
  if (!target) return null
  return createPortal(<ControlledCreatorSurface creator={creator} presentation={presentation} onExpand={onExpand} onClose={presentation === "inline" ? onClose : undefined} />, target)
}

export function ProjectCreatorDialog({ title, description, onClose, ...creatorProps }: CreatorSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="project-creator-dialog" showCloseButton={false}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description} Closing this window does not cancel a running Job.</DialogDescription>
      </DialogHeader>
      <CreatorSurface {...creatorProps} presentation="dialog" onClose={onClose} />
    </DialogContent>
  </Dialog>
}

export function MobileProjectCreatorSheet({ title, description, onClose, ...creatorProps }: CreatorSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent side="bottom" className="creator-mobile-sheet" showCloseButton>
      <SheetHeader className="creator-mobile-sheet-header">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description} Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <CreatorSurface {...creatorProps} />
      <MobileCreatorTransport active />
    </SheetContent>
  </Sheet>
}
