import { useEffect, useState, type CSSProperties } from "react"
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

export function DirectorGenerationCard({ operations, generation, canCancel, outputReady, working, onCancel, onConfirm, onRetrySaving, onRegenerate, onUseSettings, onPreview, onAddToTimeline }: {
  operations: DirectorOperationInfo[]
  generation: DirectorGeneration
  canCancel: boolean
  outputReady: boolean
  working?: boolean
  onCancel: () => void
  onConfirm: () => void
  onRetrySaving: () => void
  onRegenerate: () => void
  onUseSettings: () => void
  onPreview?: () => void
  onAddToTimeline?: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const running = generation.status === "queued" || generation.status === "generating"
  const ready = generation.status === "ready"
  const OperationIcon = generation.output_media_type === "image" ? Image : Film
  const startedAt = generation.created_at ? new Date(generation.created_at).getTime() : now
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  const ratio = generation.recipe.controls.ratio === "auto" ? "16 / 9" : generation.recipe.controls.ratio.replace(":", " / ")
  const hasMeasuredProgress = running && generation.progress > 0 && generation.progress < 100
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  return <article className="director-generation-card" data-status={generation.status}>
    <div className="director-generation-preview" style={{ "--director-generation-ratio": ratio } as CSSProperties}>
      {running ? <Skeleton className="director-generation-skeleton" /> : <div className="director-generation-result"><OperationIcon /><span>{operationLabel(operations, generation.recipe.operation)}</span></div>}
      <Badge variant="secondary" className="director-generation-status">{generation.needs_confirmation ? "Approval needed" : generation.requires_review ? "Review needed" : generation.local_ingestion_pending ? "Saving failed" : generation.status === "queued" ? "Queued" : running ? "Generating" : ready ? "Ready" : generation.status === "failed" ? "Failed" : "Canceled"}</Badge>
    </div>
    <div className="director-generation-copy">
      <header><div><strong>{generation.recipe.prompt || operationLabel(operations, generation.recipe.operation)}</strong><span>{generation.model_label} · {generation.recipe.controls.ratio} · {generation.output_media_type === "image" ? generation.recipe.controls.resolution : `${generation.recipe.controls.duration}s · ${generation.recipe.controls.resolution}`}</span></div>
        <DropdownMenu><DropdownMenuTrigger asChild><OperatorIconButton label="More generation actions" size="icon-xs"><MoreHorizontal /></OperatorIconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={onUseSettings}><SlidersHorizontal />Use settings</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(generation.recipe.prompt)}><Copy />Copy prompt</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </header>
      {running && <div className="director-generation-progress"><Progress value={hasMeasuredProgress ? generation.progress : undefined} /><span>{hasMeasuredProgress ? `${generation.progress}% · ` : ""}{elapsedLabel}</span></div>}
      {(generation.confirmation_message || generation.error) && <p className={generation.error ? "director-generation-error" : "director-generation-note"} role={generation.error ? "alert" : "status"}>{generation.confirmation_message || generation.error}</p>}
      <div className="director-generation-meta"><span><Sparkles />{operationLabel(operations, generation.recipe.operation)}</span><span><Clock3 />{generation.created_at ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(generation.created_at)) : "Now"}</span></div>
      <footer>
        {running ? canCancel ? <Button variant="outline" size="sm" onClick={onCancel}><X />Cancel</Button> : null : generation.needs_confirmation ? <>
          <Button size="sm" disabled={working} onClick={onConfirm}>{working ? "Confirming…" : "Confirm and generate"}</Button>
          <Button variant="outline" size="sm" disabled={working} onClick={onUseSettings}><SlidersHorizontal />Review settings</Button>
        </> : generation.requires_review ? <Button variant="outline" size="sm" onClick={onUseSettings}><SlidersHorizontal />Review settings</Button> : generation.can_retry_ingestion ? <>
          <Button size="sm" disabled={working} onClick={onRetrySaving}>{working ? "Saving…" : "Retry saving"}</Button>
          <Button variant="outline" size="sm" disabled={working} onClick={onUseSettings}><SlidersHorizontal />Use settings</Button>
        </> : <>
          <OperatorTooltip label="Preview" detail={outputReady ? "Open the generated Asset and its technical details." : "The generated Asset is still being saved."} disabledTrigger={!outputReady}><Button variant="outline" size="sm" disabled={!outputReady} onClick={onPreview}><Eye />Preview</Button></OperatorTooltip>
          <Button variant="outline" size="sm" onClick={onRegenerate}><RotateCcw />Regenerate</Button>
          <Button variant="outline" size="sm" onClick={onUseSettings}><WandSparkles />Remix</Button>
          <OperatorTooltip label="Add to Timeline" detail={outputReady ? "Place the generated Asset at the current playhead." : "The generated Asset is still being saved."} disabledTrigger={!outputReady}><Button size="sm" disabled={!outputReady} onClick={onAddToTimeline}>Add to Timeline</Button></OperatorTooltip>
        </>}
      </footer>
    </div>
  </article>
}
