import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react"
import { useState, type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"

import "./creator-library-workspace.css"

export function CreatorLibraryWorkspace({ creator, library, creatorDetail, libraryDetail, creatorNavigation, libraryActions, className, creatorOpen, onCreatorOpenChange, primaryLabel = "Creator", primaryAriaLabel = "Creator", workspaceLabel = "Creator Library", presentation = "workspace", libraryPaneRef, libraryPaneProps }: {
  creator: ReactNode
  library: ReactNode
  creatorDetail: string
  libraryDetail?: string
  creatorNavigation?: ReactNode
  libraryActions?: ReactNode
  className?: string
  creatorOpen?: boolean
  onCreatorOpenChange?: (open: boolean) => void
  primaryLabel?: string
  primaryAriaLabel?: string
  workspaceLabel?: string
  presentation?: "workspace" | "workstation"
  libraryPaneRef?: Ref<HTMLElement>
  libraryPaneProps?: Omit<ComponentPropsWithoutRef<"main">, "children" | "className">
}) {
  const [internalOpen, setInternalOpen] = useState(true)
  const open = creatorOpen ?? internalOpen
  const setOpen = onCreatorOpenChange ?? setInternalOpen
  const creatorPane = <aside className={cn("creator-library-creator", presentation === "workstation" && "ws-left-pane", !open && "is-collapsed")} aria-label={primaryAriaLabel}>
      {open ? <>
        <header className="creator-library-pane-header"><span><b>{primaryLabel}</b><small>{creatorDetail}</small></span><OperatorIconButton label={`Hide ${primaryLabel}`} detail="Give the Library more room while preserving this setup." onClick={() => setOpen(false)}><PanelLeftClose /></OperatorIconButton></header>
        {creatorNavigation}
        <div className="creator-library-creator-content">{creator}</div>
      </> : <div className="creator-library-collapsed"><OperatorIconButton label={`Show ${primaryLabel}`} detail="Show the controls for this capability." side="right" onClick={() => setOpen(true)}><PanelLeftOpen /></OperatorIconButton><Sparkles aria-hidden="true" /></div>}
    </aside>
  const libraryPane = <main {...libraryPaneProps} ref={libraryPaneRef} className={cn("creator-library-library", presentation === "workstation" && "ws-center-pane")} aria-label="Library">
      <header className="creator-library-pane-header"><span><b>Library</b><small>{libraryDetail || "Reusable Workspace Files"}</small></span>{libraryActions && <div className="creator-library-pane-actions">{libraryActions}</div>}</header>
      <div className="creator-library-library-content">{library}</div>
    </main>
  if (presentation === "workstation") return <>{creatorPane}{libraryPane}</>
  return <section className={cn("creator-library-workspace", !open && "is-creator-collapsed", className)} aria-label={workspaceLabel}>{creatorPane}{libraryPane}</section>
}
