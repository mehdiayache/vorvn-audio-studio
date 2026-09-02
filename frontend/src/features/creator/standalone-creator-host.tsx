import { Mic2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { CreatorSurfaceProps } from "./creator-controller"
import { CreatorSurface } from "./creator-surface"
import { MobileCreatorTransport } from "./mobile-creator-transport"

export function StandaloneCreatorHost(props: CreatorSurfaceProps) {
  const mobile = useMediaQuery("(max-width: 48rem)")
  const [open, setOpen] = useState(false)

  if (!mobile) return <CreatorSurface {...props} presentation="panel" />

  return <Sheet open={open} onOpenChange={setOpen}>
    <div className="creator-mobile-launcher">
      <div><span className="eyebrow">Speak</span><h2>Generate standalone audio</h2><p>Choose the exact voice route, write the words, then listen in this session.</p></div>
      <SheetTrigger asChild><Button><Mic2 /> Open Creator</Button></SheetTrigger>
    </div>
    <SheetContent side="bottom" className="creator-mobile-sheet" showCloseButton>
      <SheetHeader className="creator-mobile-sheet-header">
        <SheetTitle>Generate standalone audio</SheetTitle>
        <SheetDescription>Standalone recording. Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <CreatorSurface {...props} presentation="panel" />
      <MobileCreatorTransport active={open} />
    </SheetContent>
  </Sheet>
}
