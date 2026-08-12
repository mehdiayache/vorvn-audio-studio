import { useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { AppErrorBoundary } from "@/components/app-error-boundary"
import { TransportStrip } from "@/components/transport-strip"
import { Button } from "@/components/ui/button"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import { StudioHorizontalChrome, StudioIcon, useProductReadiness } from "@/design-system/vorvn"
import type { StudioNavigationItem } from "@/design-system/vorvn"
import { cn } from "@/lib/utils"

export type AudioStudioMountMode = "standalone" | "embedded"

export const audioStudioNavigation: StudioNavigationItem[] = [
  { id: "work", label: "Work", iconRole: "work", href: "/audio-studio/" },
  { id: "speak", label: "Speak", iconRole: "speak", href: "/audio-studio/speak" },
  { id: "voices", label: "Voices", iconRole: "voices", href: "/audio-studio/voices" },
  { id: "batch", label: "Batch", iconRole: "batch", href: "/audio-studio/batch" },
  { id: "subtitles", label: "Subtitles", iconRole: "subtitles", href: "/audio-studio/subtitles" },
  { id: "activity", label: "Activity", iconRole: "activity", href: "/audio-studio/activity" },
  { id: "settings", label: "Settings", iconRole: "settings", href: "/audio-studio/settings" },
]

function ReadinessStatus({ compact = false }: { compact?: boolean }) {
  const readiness = useProductReadiness()
  return (
    <div className={cn("vorvn-readiness", `is-${readiness.status}`, compact && "is-compact")} role="status">
      <i aria-hidden="true" />
      <span>{readiness.message}</span>
      {readiness.status === "unavailable" && (
        <button type="button" onClick={() => void readiness.refresh()}>Retry</button>
      )}
    </div>
  )
}
function MobileNavigation() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="vorvn-mobile-menu" aria-label="Open Audio Studio menu">
          <StudioIcon role="menu" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="vorvn-mobile-navigation">
        <SheetHeader>
          <SheetTitle>Audio Studio</SheetTitle>
          <SheetDescription>Tools and product readiness</SheetDescription>
        </SheetHeader>
        <nav aria-label="Audio Studio mobile tools">
          {audioStudioNavigation.map((item) => (
            <NavLink
              key={item.id}
              to={item.href}
              end={item.href === "/audio-studio/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cn("vorvn-mobile-navigation-link", isActive && "is-active")}
            >
              <StudioIcon role={item.iconRole} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="vorvn-mobile-navigation-readiness"><ReadinessStatus /></div>
      </SheetContent>
    </Sheet>
  )
}

export function AppShell({ mode = "standalone" }: { mode?: AudioStudioMountMode }) {
  const location = useLocation()
  return (
    <div className="studio-app-shell" data-mount-mode={mode}>
      <a className="studio-skip-link" href="#audio-studio-content">Skip to Audio Studio content</a>
      {mode === "standalone" && (
        <header className="vorvn-standalone-header">
          <NavLink className="vorvn-studio-brand" to="/audio-studio/" aria-label="Audio Studio Work">
            <span className="vorvn-studio-mark"><StudioIcon role="studio" /></span>
            <span><b>Audio Studio</b><small>Voice production</small></span>
          </NavLink>
          <div className="vorvn-standalone-actions">
            <ReadinessStatus compact />
            <MobileNavigation />
          </div>
        </header>
      )}
      <StudioHorizontalChrome items={audioStudioNavigation} />
      <main id="audio-studio-content" className="audio-studio-viewport" tabIndex={-1}>
        <AppErrorBoundary key={`${location.pathname}${location.search}`}>
          <Outlet />
        </AppErrorBoundary>
      </main>
      <TransportStrip />
    </div>
  )
}
