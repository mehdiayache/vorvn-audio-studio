import { Clock3, Copy, Eye, Film, Image, MoreHorizontal, RotateCcw, SlidersHorizontal, Sparkles, WandSparkles, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import type { DirectorGeneration } from "./director-generation-types"
import { operationLabel, type DirectorOperationInfo } from "./director-composer-config"

export function DirectorGenerationCard({ operations, generation, canCancel, onCancel, onRegenerate, onUseSettings }: {
  operations: DirectorOperationInfo[]
  generation: DirectorGeneration
  canCancel: boolean
  onCancel: () => void
  onRegenerate: () => void
  onUseSettings: () => void
}) {
  const running = generation.status === "queued" || generation.status === "generating"
  const ready = generation.status === "ready"
  const OperationIcon = generation.output_media_type === "image" ? Image : Film
  return <article className="director-generation-card" data-status={generation.status}>
    <div className="director-generation-preview">
      {running ? <Skeleton className="director-generation-skeleton" /> : <div className="director-generation-result"><OperationIcon /><span>{operationLabel(operations, generation.recipe.operation)}</span></div>}
      <Badge variant="secondary" className="director-generation-status">{generation.status === "queued" ? "Queued" : running ? "Generating" : ready ? "Prototype ready" : generation.status === "failed" ? "Failed" : "Canceled"}</Badge>
    </div>
    <div className="director-generation-copy">
      <header><div><strong>{generation.recipe.prompt || operationLabel(operations, generation.recipe.operation)}</strong><span>{generation.model_label} · {generation.recipe.controls.ratio} · {generation.output_media_type === "image" ? generation.recipe.controls.resolution : `${generation.recipe.controls.duration}s · ${generation.recipe.controls.resolution}`}</span></div>
        <DropdownMenu><DropdownMenuTrigger asChild><OperatorIconButton label="More generation actions" size="icon-xs"><MoreHorizontal /></OperatorIconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={onUseSettings}><SlidersHorizontal />Use settings</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(generation.recipe.prompt)}><Copy />Copy prompt</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </header>
      {running && <div className="director-generation-progress"><Progress value={generation.progress} /><span>{generation.progress}%</span></div>}
      {generation.error && <p className="director-generation-error" role="alert">{generation.error}</p>}
      <div className="director-generation-meta"><span><Sparkles />{operationLabel(operations, generation.recipe.operation)}</span><span><Clock3 />{generation.created_at ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(generation.created_at)) : "Now"}</span></div>
      <footer>
        {running ? canCancel ? <Button variant="outline" size="sm" onClick={onCancel}><X />Cancel</Button> : null : <>
          <OperatorTooltip label="Preview" detail="A real provider output is required in the next integration checkpoint." disabledTrigger><Button variant="outline" size="sm" disabled><Eye />Preview</Button></OperatorTooltip>
          <Button variant="outline" size="sm" onClick={onRegenerate}><RotateCcw />Regenerate</Button>
          <Button variant="outline" size="sm" onClick={onUseSettings}><WandSparkles />Remix</Button>
          <OperatorTooltip label="Add to Timeline" detail="A real provider output Asset is required in the next integration checkpoint." disabledTrigger><Button size="sm" disabled>Add to Timeline</Button></OperatorTooltip>
        </>}
      </footer>
    </div>
  </article>
}
