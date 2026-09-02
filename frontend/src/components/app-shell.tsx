import { createContext, useContext, useState } from "react"
import {
  Activity, ChevronDown, Clapperboard, Files, FolderKanban, Menu,
  PanelLeftClose, PanelLeftOpen, Settings2, Sparkles, UsersRound, Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"

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
import { productIdentity } from "@/lib/product-identity"
import { cn } from "@/lib/utils"

export type OriginsMountMode = "standalone" | "embedded"

type OriginsShellContextValue = {
  railNavigation: boolean
  railExpanded: boolean
  toggleRail: () => void
}

const OriginsShellContext = createContext<OriginsShellContextValue>({
  railNavigation: false,
  railExpanded: false,
  toggleRail: () => undefined,
})

export function OriginsRailToggle({ className, tooltipSide = "right" }: { className?: string; tooltipSide?: "right" | "bottom" }) {
  const shell = useContext(OriginsShellContext)
  if (!shell.railNavigation) return null
  const label = shell.railExpanded ? `Collapse ${productIdentity.name} navigation` : `Expand ${productIdentity.name} navigation`
  return <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon-sm" className={className} aria-label={label} onClick={shell.toggleRail}>
        {shell.railExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
    </TooltipTrigger>
    <TooltipContent side={tooltipSide}>{shell.railExpanded ? "Collapse navigation" : "Expand navigation"}</TooltipContent>
  </Tooltip>
}

type StudioNavigationItem = {
  id: "create" | "projects" | "files" | "voices" | "activity" | "settings"
  label: string
  icon: LucideIcon
  href: string
  group: "primary" | "tools" | "system"
}

export const originsNavigation: StudioNavigationItem[] = [
  { id: "create", label: "Create", icon: Sparkles, href: "/origins/", group: "primary" },
  { id: "projects", label: "Projects", icon: FolderKanban, href: "/origins/projects", group: "primary" },
  { id: "files", label: "Files", icon: Files, href: "/origins/files", group: "primary" },
  { id: "voices", label: "Voices", icon: UsersRound, href: "/origins/voices", group: "primary" },
  { id: "activity", label: "Activity", icon: Activity, href: "/origins/activity", group: "tools" },
  { id: "settings", label: "Settings", icon: Settings2, href: "/origins/settings", group: "system" },
]

export function activeOriginsDestination(pathname: string) {
  const match = originsNavigation.find((item) => (
    item.id === "create"
      ? pathname === "/origins" || pathname === "/origins/"
        || pathname === "/origins/create"
        || pathname.startsWith("/origins/create/")
      : item.id === "projects"
        ? pathname === item.href || pathname.startsWith("/origins/projects/")
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ))
  return match?.label || productIdentity.name
}

function StudioBrand() {
  return (
    <NavLink className="studio-deck-brand" to="/origins/" aria-label={`${productIdentity.name} Work`}>
      <span className="studio-deck-mark"><Clapperboard aria-hidden="true" /></span>
      <span>{productIdentity.name}</span>
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
      <NavLink className="studio-deck-readiness is-setup_required" to="/origins/settings" role="status">
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
  const primaryItems = originsNavigation.filter((item) => item.group === "primary")
  const toolItems = originsNavigation.filter((item) => item.group === "tools")
  const settings = originsNavigation.find((item) => item.id === "settings")!
  const location = useLocation()
  const toolsActive = toolItems.some((item) => location.pathname === item.href || location.pathname.startsWith(`${item.href}/`))

  return (
    <nav className="studio-deck-navigation" aria-label={`${productIdentity.name} tools`}>
      <div className="studio-deck-primary-links">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const itemActive = item.id === "create" || item.id === "projects"
            ? activeOriginsDestination(location.pathname) === item.label
            : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={itemActive ? "page" : undefined}
              className={cn("studio-deck-link", itemActive && "is-active")}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
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

function railItemActive(item: StudioNavigationItem, pathname: string) {
  return item.id === "create" || item.id === "projects"
    ? activeOriginsDestination(pathname) === item.label
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function StudioRailLink({ item, pathname }: { item: StudioNavigationItem; pathname: string }) {
  const Icon = item.icon
  const active = railItemActive(item, pathname)
  return <Tooltip>
    <TooltipTrigger asChild>
      <Link to={item.href} aria-current={active ? "page" : undefined} className={cn("studio-rail-link", active && "is-active")}>
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    </TooltipTrigger>
    <TooltipContent side="right">{item.label}</TooltipContent>
  </Tooltip>
}

function StudioRail() {
  const location = useLocation()
  const primary = originsNavigation.filter((item) => item.group === "primary")
  const tools = originsNavigation.filter((item) => item.group === "tools")
  const settings = originsNavigation.find((item) => item.id === "settings")!
  return <aside className="studio-rail" aria-label={`${productIdentity.name} navigation`}>
    <div className="studio-rail-head">
      <StudioBrand />
    </div>
    <nav className="studio-rail-navigation" aria-label={`${productIdentity.name} tools`}>
      <div className="studio-rail-group">
        {primary.map((item) => <StudioRailLink key={item.id} item={item} pathname={location.pathname} />)}
      </div>
      <div className="studio-rail-group is-tools">
        {tools.map((item) => <StudioRailLink key={item.id} item={item} pathname={location.pathname} />)}
      </div>
    </nav>
    <div className="studio-rail-footer">
      <ReadinessStatus />
      <StudioRailLink item={settings} pathname={location.pathname} />
    </div>
  </aside>
}

function MobileNavigation({ destination }: { destination: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="studio-deck-mobile-menu" aria-label={`Open ${productIdentity.name} menu`}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="studio-deck-mobile-sheet">
        <SheetHeader>
          <SheetTitle>{productIdentity.name}</SheetTitle>
          <SheetDescription>{destination}</SheetDescription>
        </SheetHeader>
        <nav aria-label={`${productIdentity.name} mobile tools`}>
          {originsNavigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.id}
                to={item.href}
                end={item.href === "/origins/"}
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

function StudioDeckChrome({ mode, destination }: { mode: OriginsMountMode; destination: string }) {
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

export function AppShell({ mode = "standalone" }: { mode?: OriginsMountMode }) {
  const location = useLocation()
  const activeDestination = activeOriginsDestination(location.pathname)
  const desktop = useMediaQuery("(min-width: 48.01rem)")
  const [railExpanded, setRailExpanded] = useState(false)
  const railNavigation = mode === "standalone" && desktop
  return (
    <OriginsShellContext.Provider value={{ railNavigation, railExpanded, toggleRail: () => setRailExpanded((expanded) => !expanded) }}>
      <div className="studio-app-shell" data-mount-mode={mode} data-presentation="standard" data-navigation={railNavigation ? "rail" : "top"} data-rail-expanded={railExpanded ? "true" : "false"}>
        <a className="studio-skip-link" href="#origins-content">Skip to {productIdentity.name} content</a>
        {railNavigation ? <StudioRail /> : <StudioDeckChrome mode={mode} destination={activeDestination} />}
        <main id="origins-content" className="origins-viewport" tabIndex={-1}>
          <AppErrorBoundary key={location.pathname}>
            <Outlet />
          </AppErrorBoundary>
        </main>
        <TransportStrip />
      </div>
    </OriginsShellContext.Provider>
  )
}
