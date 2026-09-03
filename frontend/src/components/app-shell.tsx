import { createContext, useContext, useEffect, useState } from "react"
import {
  Activity, Building2, Check, ChevronDown, Circle, Files, FolderKanban,
  FolderTree, Home, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings2,
  Shapes, Sparkles, Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { AppErrorBoundary } from "@/components/app-error-boundary"
import { useProductReadiness } from "@/components/product-readiness"
import { TransportStrip } from "@/components/transport-strip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  preferredWorkspace, rememberedWorkspaceId, rememberWorkspace, WORKSPACE_SELECTION_EVENT,
} from "@/features/workspace/workspace-selection"
import { originsApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import { cn } from "@/lib/utils"
import type { WorkspaceSummary } from "@/types/domain"

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
  id: "home" | "projects" | "explorer" | "library" | "objects" | "create" | "add" | "tools" | "activity" | "settings"
  label: string
  icon: LucideIcon
  href: string
  group: "workspace" | "actions" | "utility"
}

export const originsNavigation: StudioNavigationItem[] = [
  { id: "home", label: "Home", icon: Home, href: "/origins/home", group: "workspace" },
  { id: "projects", label: "Projects", icon: FolderKanban, href: "/origins/projects", group: "workspace" },
  { id: "explorer", label: "Explorer", icon: FolderTree, href: "/origins/explorer", group: "workspace" },
  { id: "library", label: "Library", icon: Files, href: "/origins/library", group: "workspace" },
  { id: "objects", label: "Objects", icon: Shapes, href: "/origins/objects", group: "workspace" },
  { id: "create", label: "Create", icon: Sparkles, href: "/origins/create/generate-image", group: "actions" },
  { id: "add", label: "Add", icon: Plus, href: "/origins/add", group: "actions" },
  { id: "tools", label: "Tools", icon: Wrench, href: "/origins/tools", group: "actions" },
  { id: "activity", label: "Activity", icon: Activity, href: "/origins/activity", group: "utility" },
  { id: "settings", label: "Settings", icon: Settings2, href: "/origins/settings", group: "utility" },
]

export function activeOriginsDestination(pathname: string) {
  const match = originsNavigation.find((item) => (
    item.id === "home"
      ? pathname === item.href || pathname.startsWith(`${item.href}/`)
      : item.id === "create"
        ? pathname === "/origins/create" || (pathname.startsWith("/origins/create/") && !pathname.startsWith("/origins/create/create-subtitles"))
        : item.id === "tools"
          ? pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname.startsWith("/origins/create/create-subtitles")
          : item.id === "library"
            ? pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname === "/origins/files"
            : item.id === "objects"
              ? pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname.startsWith("/origins/voices")
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ))
  if (match) return match.label
  if (pathname === "/origins" || pathname === "/origins/") return "Workspaces"
  if (pathname.startsWith("/origins/productions/")) return "Audiovisual Production"
  if (pathname === "/origins/productions") return "Productions"
  return productIdentity.name
}

function StudioBrand() {
  return (
    <NavLink className="studio-deck-brand" to="/origins/" aria-label={productIdentity.name}>
      <span className="studio-deck-mark"><Circle aria-hidden="true" fill="currentColor" strokeWidth={0} /></span>
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
  const primaryItems = originsNavigation.filter((item) => item.group !== "utility")
  const utilityItems = originsNavigation.filter((item) => item.group === "utility")
  const location = useLocation()

  return (
    <nav className="studio-deck-navigation" aria-label={`${productIdentity.name} tools`}>
      <div className="studio-deck-primary-links">
        {primaryItems.map((item) => {
          const Icon = item.icon
          const itemActive = activeOriginsDestination(location.pathname) === item.label
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
            <Button variant="ghost" size="sm" className="studio-deck-tools-trigger">
              <Wrench aria-hidden="true" />
              More
              <ChevronDown className="studio-deck-chevron" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="studio-deck-menu">
            <DropdownMenuLabel>Origins</DropdownMenuLabel>
            <DropdownMenuGroup>
              {utilityItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.id} asChild>
                    <NavLink to={item.href}><Icon />{item.label}</NavLink>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}

function railItemActive(item: StudioNavigationItem, pathname: string) {
  return activeOriginsDestination(pathname) === item.label
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

function WorkspaceRailSelector() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [selectedId, setSelectedId] = useState(() => rememberedWorkspaceId())
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    void originsApi.workspaces().then((items) => {
      if (!active) return
      setWorkspaces(items)
      const next = preferredWorkspace(items)
      if (next) setSelectedId(next.id)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])
  useEffect(() => {
    const syncSelection = (event: Event) => {
      const workspaceId = (event as CustomEvent<number>).detail || rememberedWorkspaceId()
      if (workspaceId) setSelectedId(workspaceId)
    }
    window.addEventListener(WORKSPACE_SELECTION_EVENT, syncSelection)
    window.addEventListener("storage", syncSelection)
    return () => {
      window.removeEventListener(WORKSPACE_SELECTION_EVENT, syncSelection)
      window.removeEventListener("storage", syncSelection)
    }
  }, [])

  const selected = workspaces.find((workspace) => workspace.id === selectedId)
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="studio-workspace-selector" aria-label={`Current Workspace: ${selected?.name || "Loading"}`}>
            <Building2 aria-hidden="true" />
            <span>{selected?.name || "Workspace"}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="right">{selected?.name || "Choose Workspace"}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent side="right" align="start" className="studio-workspace-menu">
      <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
      <DropdownMenuGroup>
        {workspaces.map((workspace) => <DropdownMenuItem
          key={workspace.id}
          onSelect={() => {
            setSelectedId(workspace.id)
            rememberWorkspace(workspace.id)
            navigate("/origins/home")
          }}
        >
          <Building2 />
          <span>{workspace.name}</span>
          {workspace.id === selectedId && <Check className="studio-workspace-check" />}
        </DropdownMenuItem>)}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

function StudioRail() {
  const location = useLocation()
  const workspaceItems = originsNavigation.filter((item) => item.group === "workspace")
  const actionItems = originsNavigation.filter((item) => item.group === "actions")
  const utilityItems = originsNavigation.filter((item) => item.group === "utility")
  return <aside className="studio-rail" aria-label={`${productIdentity.name} navigation`}>
    <div className="studio-rail-head">
      <div className="studio-rail-brand-row"><StudioBrand /><OriginsRailToggle className="studio-rail-toggle" /></div>
      <WorkspaceRailSelector />
    </div>
    <nav className="studio-rail-navigation" aria-label={`${productIdentity.name} tools`}>
      <div className="studio-rail-group">
        {workspaceItems.map((item) => <StudioRailLink key={item.id} item={item} pathname={location.pathname} />)}
      </div>
      <div className="studio-rail-group is-actions">
        {actionItems.map((item) => <StudioRailLink key={item.id} item={item} pathname={location.pathname} />)}
      </div>
    </nav>
    <div className="studio-rail-footer">
      <ReadinessStatus />
      {utilityItems.map((item) => <StudioRailLink key={item.id} item={item} pathname={location.pathname} />)}
    </div>
  </aside>
}

function OriginsGatewayChrome({ mode }: { mode: OriginsMountMode }) {
  return <header className="studio-gateway-bar">
    <div>
      {mode === "standalone" && <StudioBrand />}
      <span>Workspaces</span>
    </div>
    <nav aria-label={`${productIdentity.name} utility navigation`}>
      <NavLink to="/origins/activity"><Activity /><span>Activity</span></NavLink>
      <NavLink to="/origins/settings"><Settings2 /><span>Settings</span></NavLink>
    </nav>
  </header>
}

function MobileNavigation({ destination }: { destination: string }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
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
            const active = activeOriginsDestination(location.pathname) === item.label
            return (
              <Link
                key={item.id}
                to={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn("studio-deck-mobile-link", active && "is-active", (item.id === "create" || item.id === "activity") && "is-group-start")}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
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
  const workspaceGateway = location.pathname === "/origins" || location.pathname === "/origins/"
  const railNavigation = mode === "standalone" && desktop && !workspaceGateway
  return (
    <OriginsShellContext.Provider value={{ railNavigation, railExpanded, toggleRail: () => setRailExpanded((expanded) => !expanded) }}>
      <div className="studio-app-shell" data-mount-mode={mode} data-presentation="standard" data-navigation={workspaceGateway ? "gateway" : railNavigation ? "rail" : "top"} data-rail-expanded={railExpanded ? "true" : "false"}>
        <a className="studio-skip-link" href="#origins-content">Skip to {productIdentity.name} content</a>
        {workspaceGateway ? <OriginsGatewayChrome mode={mode} /> : railNavigation ? <StudioRail /> : <StudioDeckChrome mode={mode} destination={activeDestination} />}
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
