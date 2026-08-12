import { ArrowLeft, CircleAlert, Command, Folder, MoreHorizontal, Pause, Play, Plus, SlidersHorizontal, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDuration, formatMoney } from "@/lib/format"
import type { Production } from "@/types/domain"

export function ProductionHeader({ production, duration, releaseOpen, productionPlaying, issueCount, onExplorer, onCast, onCommands, onHealth, onPreview, onAdd, onRelease, onBack }: {
  production: Production
  duration: number
  releaseOpen: boolean
  productionPlaying: boolean
  issueCount: number
  onExplorer: () => void
  onCast: () => void
  onCommands: () => void
  onHealth: () => void
  onPreview: () => void
  onAdd: (kind: "speech" | "asset" | "silence") => void
  onRelease: () => void
  onBack: () => void
}) {
  return (
      <section className="production-context-bar production-header-compact" aria-label="Production navigation">
        <div className="production-context-left">
          <Button variant="outline" size="icon" onClick={onExplorer} aria-label="Open Production Explorer"><Folder /></Button>
          <div className="production-context-copy">
            <ShellBreadcrumbs trail={production.trail} current={{ type: "production", name: production.name }} />
            <div className="production-header-title"><span className="eyebrow">{releaseOpen ? "Mix & export" : "Production"}</span><h1>{production.name}</h1><div className="production-metrics" aria-label="Production metrics"><Badge variant="outline">{production.status.replaceAll("_", " ")}</Badge><span><b>{production.parts.filter((part) => part.kind !== "stitch").length}</b> parts</span><span><b>{formatDuration(duration)}</b></span><span title="Historical provider spend"><b>{formatMoney(production.total_cost)}</b> spent</span>{production.parts.some((part) => part.kind === "draft") && <Badge variant="secondary">Has drafts</Badge>}</div></div>
          </div>
        </div>
        <div className="production-context-actions">
          {releaseOpen ? <Button variant="outline" onClick={onBack}><ArrowLeft /> Back to production</Button> : <>
            <Button variant="outline" onClick={onPreview}>{productionPlaying ? <Pause /> : <Play />} {productionPlaying ? "Pause" : "Preview"}</Button>
            <Button className="mix-export-action" variant="outline" onClick={onRelease}><SlidersHorizontal /> Mix & Export</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button><Plus /> Add part</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onAdd("speech")}><Plus /> Add speech</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAdd("silence")}><Plus /> Add silence</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAdd("asset")}><Plus /> Add Intro, Outro or Stinger</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More Production actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExplorer}><Folder /> Open Explorer</DropdownMenuItem>
              <DropdownMenuItem onSelect={onCast}><Users /> Manage Cast</DropdownMenuItem>
              <DropdownMenuItem onSelect={onCommands}><Command /> Command menu</DropdownMenuItem>
              <DropdownMenuItem onSelect={onHealth}><CircleAlert /> Production health{issueCount ? ` · ${issueCount}` : ""}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </>}
        </div>
      </section>
  )
}
