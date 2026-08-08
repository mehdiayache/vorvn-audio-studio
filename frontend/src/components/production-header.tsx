import { ArrowLeft, Folder, Plus, SlidersHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDuration, formatMoney } from "@/lib/format"
import type { Production } from "@/types/domain"

export function ProductionHeader({ production, duration, releaseOpen, onExplorer, onAdd, onRelease, onBack }: {
  production: Production
  duration: number
  releaseOpen: boolean
  onExplorer: () => void
  onAdd: (kind: "speech" | "asset" | "silence") => void
  onRelease: () => void
  onBack: () => void
}) {
  return (
    <>
      <section className="production-context-bar" aria-label="Production navigation">
        <div className="production-context-left">
          <Button variant="outline" size="icon" onClick={onExplorer} aria-label="Open Production Explorer"><Folder /></Button>
          <div className="production-context-copy">
            <ShellBreadcrumbs trail={production.trail} current={{ type: "production", name: production.name }} />
          </div>
        </div>
        <div className="production-context-actions">
          {releaseOpen ? <Button variant="outline" onClick={onBack}><ArrowLeft /> Back to production</Button> : <>
            <Button className="mix-export-action" variant="outline" onClick={onRelease}><SlidersHorizontal /> Mix & Export</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus /> Add part</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onAdd("speech")}><Plus /> Add speech</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAdd("silence")}><Plus /> Add silence</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAdd("asset")}><Plus /> Add Intro, Outro or Stinger</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>}
        </div>
      </section>
      <section className="production-overview">
        <div className="production-heading">
          <span className="eyebrow">{releaseOpen ? "Mix & export" : "Production"}</span>
          <h1>{production.name}</h1>
          <p>{production.description || "An editable voice Production."}</p>
          <div className="production-metrics" aria-label="Production metrics">
            <span><b>{production.parts.filter((part) => part.kind !== "stitch").length}</b> parts</span>
            <span><b>{formatDuration(duration)}</b> duration</span>
            <span title="Includes provider spend for deleted Parts and earlier work"><b>{formatMoney(production.total_cost)}</b> historical spend</span>
            {Math.abs(production.total_cost - production.current_sequence_cost) > 0.000001 && <span title="Only the takes currently placed in this sequence"><b>{formatMoney(production.current_sequence_cost)}</b> current sequence</span>}
            {production.parts.some((part) => part.kind === "draft") && <Badge variant="secondary">Has drafts</Badge>}
          </div>
        </div>
      </section>
    </>
  )
}
