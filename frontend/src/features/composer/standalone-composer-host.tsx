import { Mic2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { ComposerSurfaceProps } from "./composer-controller"
import { ComposerSurface } from "./composer-surface"
import { MobileComposerTransport } from "./mobile-composer-transport"

export function StandaloneComposerHost(props: ComposerSurfaceProps) {
  const mobile = useMediaQuery("(max-width: 48rem)")
  const [open, setOpen] = useState(false)

  if (!mobile) return <ComposerSurface {...props} />

  return <Sheet open={open} onOpenChange={setOpen}>
    <div className="composer-mobile-launcher">
      <div><span className="eyebrow">Speak</span><h2>Generate standalone audio</h2><p>Choose the exact voice route, write the words, then listen in this session.</p></div>
      <SheetTrigger asChild><Button><Mic2 /> Open Composer</Button></SheetTrigger>
    </div>
    <SheetContent side="bottom" className="composer-mobile-sheet" showCloseButton>
      <SheetHeader className="composer-mobile-sheet-header">
        <SheetTitle>Generate standalone audio</SheetTitle>
        <SheetDescription>Standalone recording. Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <ComposerSurface {...props} />
      <MobileComposerTransport active={open} />
    </SheetContent>
  </Sheet>
}
