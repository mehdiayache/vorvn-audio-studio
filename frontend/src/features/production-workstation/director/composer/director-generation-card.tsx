import { Clock3, Copy, Eye, Film, Image, MoreHorizontal, RotateCcw, SlidersHorizontal, Sparkles, WandSparkles, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import type { DirectorGeneration } from "./director-composer"
import { operationLabel } from "./director-composer-config"

export function DirectorGenerationCard({ generation, onCancel, onRegenerate, onUseSettings }: {
  generation: DirectorGeneration
  onCancel: () => void
  onRegenerate: () => void
  onUseSettings: () => void
}) {
  const running = generation.status === "generating"
  const ready = generation.status === "ready"
  const OperationIcon = generation.operation === "image" ? Image : Film
  return <article className="director-generation-card" data-status={generation.status}>
    <div className="director-generation-preview">
      {running ? <Skeleton className="director-generation-skeleton" /> : <div className="director-generation-result"><OperationIcon /><span>{operationLabel(generation.operation)}</span></div>}
      <Badge variant="secondary" className="director-generation-status">{running ? "Generating" : ready ? "Prototype ready" : "Canceled"}</Badge>
    </div>
    <div className="director-generation-copy">
      <header><div><strong>{generation.prompt}</strong><span>{generation.modelLabel} · {generation.ratio} · {generation.operation === "image" ? generation.resolution : `${generation.duration}s · ${generation.resolution}`}</span></div>
        <DropdownMenu><DropdownMenuTrigger asChild><OperatorIconButton label="More generation actions" size="icon-xs"><MoreHorizontal /></OperatorIconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={onUseSettings}><SlidersHorizontal />Use settings</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(generation.prompt)}><Copy />Copy prompt</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </header>
      {running && <div className="director-generation-progress"><Progress value={generation.progress} /><span>{generation.progress}%</span></div>}
      <div className="director-generation-meta"><span><Sparkles />{operationLabel(generation.operation)}</span><span><Clock3 />{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(generation.createdAt))}</span></div>
      <footer>
        {running ? <Button variant="outline" size="sm" onClick={onCancel}><X />Cancel</Button> : <>
          <OperatorTooltip label="Preview" detail="A real provider output is required in the next integration checkpoint." disabledTrigger><Button variant="outline" size="sm" disabled><Eye />Preview</Button></OperatorTooltip>
          <Button variant="outline" size="sm" onClick={onRegenerate}><RotateCcw />Regenerate</Button>
          <Button variant="outline" size="sm" onClick={onUseSettings}><WandSparkles />Remix</Button>
          <OperatorTooltip label="Add to Timeline" detail="A real provider output Asset is required in the next integration checkpoint." disabledTrigger><Button size="sm" disabled>Add to Timeline</Button></OperatorTooltip>
        </>}
      </footer>
    </div>
  </article>
}
