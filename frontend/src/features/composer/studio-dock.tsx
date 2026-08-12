import { ChevronDown, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { ComposerSurfaceProps } from "./composer-controller"
import { ComposerSurface } from "./composer-surface"

export function StudioDock({ title, description, onClose, ...composerProps }: ComposerSurfaceProps & { title: string; description: string; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState(false)
  const mobile = useMediaQuery("(max-width: 48rem)")

  if (mobile) return <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent side="bottom" className="composer-mobile-sheet" showCloseButton>
      <SheetHeader className="composer-mobile-sheet-header">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description} Closing this sheet does not cancel a running Job.</SheetDescription>
      </SheetHeader>
      <ComposerSurface {...composerProps} />
    </SheetContent>
  </Sheet>

  return <section className={`studio-dock${collapsed ? " is-collapsed" : ""}`} aria-label="Speech Composer" aria-expanded={!collapsed}>
    <header className="studio-dock-header"><div><span className="eyebrow">Composer</span><h2>{title}</h2>{!collapsed && <p>{description}</p>}</div><div><Button variant="ghost" size="icon" aria-label={collapsed ? "Expand Composer" : "Collapse Composer"} onClick={() => setCollapsed((value) => !value)}><ChevronDown /></Button><Button variant="ghost" size="icon" aria-label="Close Composer" onClick={onClose}><X /></Button></div></header>
    {!collapsed && <ComposerSurface {...composerProps} />}
  </section>
}
