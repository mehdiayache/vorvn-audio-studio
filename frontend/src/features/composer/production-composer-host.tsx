import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ComposerSurfaceProps } from "./composer-controller"
import { ComposerSurface } from "./composer-surface"
import { MobileComposerTransport } from "./mobile-composer-transport"

export function ProductionComposerWorkbench(props: ComposerSurfaceProps) {
  return <div className="production-composer-workbench"><ComposerSurface {...props} visible /></div>
}

export function MobileProductionComposerSheet({ title, description, onClose, ...composerProps }: ComposerSurfaceProps & { title: string; description: string; onClose: () => void }) {
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
