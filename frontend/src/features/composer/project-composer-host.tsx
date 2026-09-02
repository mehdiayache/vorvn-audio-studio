import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { createPortal } from "react-dom"

import { type ComposerSurfaceProps, useComposerController } from "./composer-controller"
import { ComposerSurface, ControlledComposerSurface, type ComposerPresentation } from "./composer-surface"
import { MobileComposerTransport } from "./mobile-composer-transport"

export function ProjectComposerStage(props: ComposerSurfaceProps) {
  return <div className="project-composer-stage"><ComposerSurface {...props} presentation="stage" visible /></div>
}

export function ProjectComposerSession({ target, presentation, onExpand, onClose, ...props }: ComposerSurfaceProps & {
  target: HTMLElement | null
  presentation: Extract<ComposerPresentation, "inline" | "stage">
  onExpand: () => void
  onClose: () => void
}) {
  const composer = useComposerController({ ...props, visible: true })
  if (!target) return null
  return createPortal(<ControlledComposerSurface composer={composer} presentation={presentation} onExpand={onExpand} onClose={presentation === "inline" ? onClose : undefined} />, target)
}

export function ProjectComposerDialog({ title, description, onClose, ...composerProps }: ComposerSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="project-composer-dialog" showCloseButton={false}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description} Closing this window does not cancel a running Job.</DialogDescription>
      </DialogHeader>
      <ComposerSurface {...composerProps} presentation="dialog" onClose={onClose} />
    </DialogContent>
  </Dialog>
}

export function MobileProjectComposerSheet({ title, description, onClose, ...composerProps }: ComposerSurfaceProps & { title: string; description: string; onClose: () => void }) {
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent side="bottom" className="composer-mobile-sheet" showCloseButton>
      <SheetHeader className="composer-mobile-sheet-header">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description} Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <ComposerSurface {...composerProps} />
      <MobileComposerTransport active />
    </SheetContent>
  </Sheet>
}
