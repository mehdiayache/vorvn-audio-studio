import { useState } from "react"
import {
  Activity, AudioLines, Captions, ChevronDown, FolderKanban, Menu, Mic2,
  Settings2, UsersRound, Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { AppErrorBoundary } from "@/components/app-error-boundary"
import { useProductReadiness } from "@/components/product-readiness"
import { TransportStrip } from "@/components/transport-strip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import { studioRouteFromLocation } from "@/lib/routes"
import { cn } from "@/lib/utils"

export type AudioStudioMountMode = "standalone" | "embedded"

type StudioNavigationItem = {
  id: "work" | "speak" | "voices" | "subtitles" | "activity" | "settings"
  label: string
  icon: LucideIcon
  href: string
  group: "primary" | "tools" | "system"
}

export const audioStudioNavigation: StudioNavigationItem[] = [
  { id: "work", label: "Productions", icon: FolderKanban, href: "/audio-studio/", group: "primary" },
  { id: "speak", label: "Create", icon: Mic2, href: "/audio-studio/speak", group: "primary" },
  { id: "voices", label: "Voices", icon: UsersRound, href: "/audio-studio/voices", group: "primary" },
  { id: "subtitles", label: "Subtitles", icon: Captions, href: "/audio-studio/subtitles", group: "tools" },
  { id: "activity", label: "Activity", icon: Activity, href: "/audio-studio/activity", group: "tools" },
  { id: "settings", label: "Settings", icon: Settings2, href: "/audio-studio/settings", group: "system" },
]

export function activeAudioStudioDestination(pathname: string) {
  const match = audioStudioNavigation.find((item) => (
    item.id === "work"
      ? pathname === "/audio-studio" || pathname === "/audio-studio/" || /^\/audio-studio\/(ventures|projects|series|productions|workspaces)\//.test(pathname)
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ))
  return match?.label || "Audio Studio"
}

function StudioBrand() {
  return (
    <NavLink className="studio-deck-brand" to="/audio-studio/" aria-label="Audio Studio Work">
      <span className="studio-deck-mark"><AudioLines aria-hidden="true" /></span>
      <span>Audio Studio</span>
    </NavLink>
  )
}

function ReadinessStatus() {
  const readiness = useProductReadiness()
  if (readiness.status === "ready") {
    return <span className="sr-only" role="status">{readiness.message}</span>
  }
  if (readiness.status === "checking") {
    return <span className="studio-deck-readiness is-checking" role="status">Checking…</span>
  }
  if (readiness.status === "setup_required") {
    return (
      <NavLink className="studio-deck-readiness is-setup_required" to="/audio-studio/settings" role="status">
        <span aria-hidden="true" />
        {readiness.message}
      </NavLink>
    )
  }
  return (
    <button
      type="button"
      className={cn("studio-deck-readiness", `is-${readiness.status}`)}
      onClick={() => void readiness.refresh()}
    >
      <span aria-hidden="true" />
      {readiness.message}
    </button>
  )
}

function PrimaryNavigation() {
  const primaryItems = audioStudioNavigation.filter((item) => item.group === "primary")
  const toolItems = audioStudioNavigation.filter((item) => item.group === "tools")
  const settings = audioStudioNavigation.find((item) => item.id === "settings")!
  const location = useLocation()
  const toolsActive = toolItems.some((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`))

  return (
    <nav className="studio-deck-navigation" aria-label="Audio Studio tools">
      <div className="studio-deck-primary-links">
        {primaryItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.id}
              to={item.href}
              end={item.href === "/audio-studio/"}
              className={({ isActive }) => cn("studio-deck-link", isActive && "is-active")}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>

      <div className="studio-deck-secondary-links">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("studio-deck-tools-trigger", toolsActive && "is-active")}>
              <Wrench aria-hidden="true" />
              Tools
              <ChevronDown className="studio-deck-chevron" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="studio-deck-menu">
            <DropdownMenuLabel>Audio tools</DropdownMenuLabel>
            <DropdownMenuGroup>
              {toolItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <NavLink to={item.href}><Icon />{item.label}</NavLink>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <NavLink to={settings.href}><Settings2 />Settings</NavLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild className="studio-deck-settings">
              <NavLink to={settings.href} aria-label="Settings"><Settings2 /></NavLink>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}

function MobileNavigation({ destination }: { destination: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="studio-deck-mobile-menu" aria-label="Open Audio Studio menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="studio-deck-mobile-sheet">
        <SheetHeader>
          <SheetTitle>Audio Studio</SheetTitle>
          <SheetDescription>{destination}</SheetDescription>
        </SheetHeader>
        <nav aria-label="Audio Studio mobile tools">
          {audioStudioNavigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.id}
                to={item.href}
                end={item.href === "/audio-studio/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn("studio-deck-mobile-link", isActive && "is-active")}
              >
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

function StudioDeckChrome({ mode, destination }: { mode: AudioStudioMountMode; destination: string }) {
  return (
    <header className="studio-deck-bar">
      <div className="studio-deck-bar-inner">
        {mode === "standalone" && <StudioBrand />}
        <span className="studio-deck-mobile-destination" aria-current="page">{destination}</span>
        <PrimaryNavigation />
        <div className="studio-deck-status">
          <ReadinessStatus />
          <MobileNavigation destination={destination} />
        </div>
      </div>
    </header>
  )
}

export function AppShell({ mode = "standalone" }: { mode?: AudioStudioMountMode }) {
  const location = useLocation()
  const activeDestination = activeAudioStudioDestination(location.pathname)
  const desktop = useMediaQuery("(min-width: 48.001rem)")
  const route = studioRouteFromLocation(location.pathname, location.search)
  const productionFocus = mode === "standalone" && desktop && route.type === "production"
  return (
    <div className="studio-app-shell" data-mount-mode={mode} data-presentation={productionFocus ? "production-focus" : "standard"}>
      <a className="studio-skip-link" href="#audio-studio-content">Skip to Audio Studio content</a>
      {!productionFocus && <StudioDeckChrome mode={mode} destination={activeDestination} />}
      <main id="audio-studio-content" className="audio-studio-viewport" tabIndex={-1}>
        <AppErrorBoundary key={location.pathname}>
          <Outlet />
        </AppErrorBoundary>
      </main>
      <TransportStrip />
    </div>
  )
}
