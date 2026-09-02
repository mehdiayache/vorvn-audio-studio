import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react"
import { useState, type ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { cn } from "@/lib/utils"

import "./creator-library-workspace.css"

export function CreatorLibraryWorkspace({ creator, library, creatorDetail, libraryDetail, className }: {
  creator: ReactNode
  library: ReactNode
  creatorDetail: string
  libraryDetail?: string
  className?: string
}) {
  const [creatorOpen, setCreatorOpen] = useState(true)
  return <section className={cn("creator-library-workspace", !creatorOpen && "is-creator-collapsed", className)} aria-label="Creator Library">
    <aside className="creator-library-creator" aria-label="Creator">
      {creatorOpen ? <>
        <header className="creator-library-pane-header"><span><b>Creator</b><small>{creatorDetail}</small></span><OperatorIconButton label="Hide Creator" detail="Give the Library more room while preserving this creation setup." onClick={() => setCreatorOpen(false)}><PanelLeftClose /></OperatorIconButton></header>
        <div className="creator-library-creator-content">{creator}</div>
      </> : <div className="creator-library-collapsed"><OperatorIconButton label="Show Creator" detail="Show creation controls for this capability." side="right" onClick={() => setCreatorOpen(true)}><PanelLeftOpen /></OperatorIconButton><Sparkles aria-hidden="true" /></div>}
    </aside>
    <section className="creator-library-library" aria-label="Library">
      <header className="creator-library-pane-header"><span><b>Library</b><small>{libraryDetail || "Reusable Workspace Files"}</small></span></header>
      <div className="creator-library-library-content">{library}</div>
    </section>
  </section>
}
