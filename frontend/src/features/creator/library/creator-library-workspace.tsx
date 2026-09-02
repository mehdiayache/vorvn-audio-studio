import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react"
import { useState, type ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"

import "./creator-library-workspace.css"

export function CreatorLibraryWorkspace({ creator, library, creatorDetail, libraryDetail, creatorNavigation, libraryActions, className, creatorOpen, onCreatorOpenChange, primaryLabel = "Creator", primaryAriaLabel = "Creator", workspaceLabel = "Creator Library" }: {
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
}) {
  const [internalOpen, setInternalOpen] = useState(true)
  const open = creatorOpen ?? internalOpen
  const setOpen = onCreatorOpenChange ?? setInternalOpen
  return <section className={cn("creator-library-workspace", !open && "is-creator-collapsed", className)} aria-label={workspaceLabel}>
    <aside className="creator-library-creator" aria-label={primaryAriaLabel}>
      {open ? <>
        <header className="creator-library-pane-header"><span><b>{primaryLabel}</b><small>{creatorDetail}</small></span><OperatorIconButton label={`Hide ${primaryLabel}`} detail="Give the Library more room while preserving this setup." onClick={() => setOpen(false)}><PanelLeftClose /></OperatorIconButton></header>
        {creatorNavigation}
        <div className="creator-library-creator-content">{creator}</div>
      </> : <div className="creator-library-collapsed"><OperatorIconButton label={`Show ${primaryLabel}`} detail="Show the controls for this capability." side="right" onClick={() => setOpen(true)}><PanelLeftOpen /></OperatorIconButton><Sparkles aria-hidden="true" /></div>}
    </aside>
    <section className="creator-library-library" aria-label="Library">
      <header className="creator-library-pane-header"><span><b>Library</b><small>{libraryDetail || "Reusable Workspace Files"}</small></span>{libraryActions && <div className="creator-library-pane-actions">{libraryActions}</div>}</header>
      <div className="creator-library-library-content">{library}</div>
    </section>
  </section>
}
