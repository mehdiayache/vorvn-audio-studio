import { useEffect, useState, type CSSProperties } from "react"
import { AlertCircle, CircleCheck, Clock3, Copy, Eye, Film, Image, MoreHorizontal, Plus, RotateCcw, SlidersHorizontal, Sparkles, WandSparkles, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"
import { displayedGenerationCost, type MediaGeneration } from "./media-generation-types"
import type { WorkspaceFile } from "@/types/domain"
import { visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "@/features/projects/audiovisual/visuals/visuals-files"
import { operationLabel, type MediaOperationInfo } from "./media-composer-config"

function operatorMessage(message: string | null | undefined) {
  return message?.replace(/\bassets?\b/gi, "media").replace(/\bjobs?\b/gi, "requests") || ""
}

function elapsedDuration(start: string | null, end: string | null) {
  if (!start || !end) return "Not reported"
  const milliseconds = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not reported"
  const seconds = Math.round(milliseconds / 100) / 10
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

function factLabel(value: string) {
  const words = value.replace(/[-_]+/g, " ")
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function settingValue(value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off"
  if (Array.isArray(value)) return value.length ? `${value.length} configured` : "None"
  if (value && typeof value === "object") return "Configured"
  return String(value)
}

export function MediaGenerationCard({ operations, generation, canCancel, outputFiles = [], working, compact = false, usedCount = 0, onCancel, onConfirm, onRetrySaving, onRegenerate, onUseSettings, onPreview, onAddToTimeline, onDismiss }: {
  operations: MediaOperationInfo[]
  generation: MediaGeneration
  canCancel: boolean
  outputFiles?: WorkspaceFile[]
  working?: boolean
  compact?: boolean
  usedCount?: number
  onCancel: () => void
  onConfirm: () => void
  onRetrySaving: () => void
  onRegenerate: () => void
  onUseSettings: () => void
  onPreview?: () => void
  onAddToTimeline?: () => void
  onDismiss?: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const [detailsOpen, setDetailsOpen] = useState(false)
  const running = generation.status === "queued" || generation.status === "generating"
  const ready = generation.status === "ready"
  const saving = running && /saving/i.test(generation.detail)
  const OperationIcon = generation.output_media_type === "image" ? Image : Film
  const startedAt = generation.created_at ? new Date(generation.created_at).getTime() : now
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000))
  const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  const firstOutput = outputFiles[0]
  const ratio = firstOutput?.width && firstOutput.height
    ? `${firstOutput.width} / ${firstOutput.height}`
    : generation.preset.controls.ratio === "auto" ? "16 / 9" : generation.preset.controls.ratio.replace(":", " / ")
  const hasMeasuredProgress = running && generation.progress > 0 && generation.progress < 100
  const outputReady = outputFiles.length > 0
  const loadingResult = ready && generation.output_file_ids.length > 0 && !outputReady
  const references = generation.preset.inputs.map((input) => `${factLabel(input.role || input.media_type)}: media #${input.file_id}`).join(" · ")
  const providerSettings = generation.preset.controls.provider_parameters
  const hasProviderSettings = Object.keys(providerSettings).length > 0
  const providerSettingsLabel = Object.entries(providerSettings).map(([key, value]) => `${factLabel(key)}: ${settingValue(value)}`).join(" · ")
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const mediaLabel = generation.output_media_type === "image" ? "Image" : "Video"
  const reportedCost = displayedGenerationCost(generation)
  const detailsDialog = <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="media-generation-details"><DialogHeader><DialogTitle>Creation request</DialogTitle><DialogDescription>Durable request, model, inputs and output facts.</DialogDescription></DialogHeader><dl>
    <div><dt>Status</dt><dd>{generation.local_ingestion_pending ? "Saving failed" : generation.status}</dd></div>
    <div><dt>Prompt</dt><dd>{generation.preset.prompt || "No prompt"}</dd></div>
    <div><dt>Model</dt><dd>{generation.model_label} · {generation.provider_model_id || generation.preset.model_id}</dd></div>
    <div><dt>Provider</dt><dd>{generation.provider}</dd></div>
    <div><dt>Operation</dt><dd>{operationLabel(operations, generation.preset.operation)}</dd></div>
    <div><dt>References</dt><dd>{references || "None"}</dd></div>
    <div><dt>Format</dt><dd>{generation.preset.controls.ratio} · {generation.preset.controls.resolution}{generation.preset.controls.duration ? ` · ${generation.preset.controls.duration}s` : ""}{generation.preset.controls.fps ? ` · ${generation.preset.controls.fps} fps` : ""}</dd></div>
    <div><dt>Seed</dt><dd>{generation.preset.controls.seed ?? "Provider chosen"}</dd></div>
    <div><dt>Estimated cost</dt><dd>{generation.estimated_cost != null ? `$${generation.estimated_cost.toFixed(4)}` : "Not reported"}</dd></div>
    <div><dt>Actual cost</dt><dd>{generation.cost != null ? `$${generation.cost.toFixed(4)}` : "Not reported"}</dd></div>
    <div><dt>Generation time</dt><dd>{elapsedDuration(generation.created_at, generation.updated_at)}</dd></div>
    <div><dt>Model settings</dt><dd>{hasProviderSettings ? providerSettingsLabel : "Model defaults"}</dd></div>
    <div><dt>Provider task</dt><dd>{generation.provider_job_id || "Not assigned yet"}</dd></div>
    <div><dt>Result IDs</dt><dd>{generation.output_file_ids.join(", ") || "None yet"}</dd></div>
    {generation.error && <div><dt>Error</dt><dd>{operatorMessage(generation.error)}</dd></div>}
  </dl></DialogContent></Dialog>
  if (compact) return <>
    <article className="media-generation-card is-creation-item" data-status={generation.status}>
      <div className="media-generation-preview" style={{ "--media-generation-ratio": ratio } as CSSProperties}>
        {running ? <><Skeleton className="media-generation-skeleton" /><div className="media-generation-running-center"><Sparkles /><strong>{saving ? "Saving" : generation.status === "queued" ? "Queued" : "Generating"}</strong><span>{elapsedLabel}</span>{hasMeasuredProgress && <Progress value={generation.progress} />}</div></>
          : outputReady ? <button type="button" className="media-generation-output-target" aria-label={`Preview generated ${mediaLabel.toLowerCase()}`} onClick={onPreview}><div className="media-generation-outputs">{outputFiles.map((file) => file.media_type === "video"
            ? <video key={file.id} src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} muted loop playsInline preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0 }} />
            : <img key={file.id} src={visualFileUrl(file)} alt="" />)}</div></button>
            : <div className="media-generation-result">{generation.status === "failed" || ready ? <AlertCircle /> : <OperationIcon />}<strong>{generation.local_ingestion_pending ? "Saving failed" : loadingResult ? "Loading result" : generation.status === "failed" ? "Generation failed" : ready ? "Result unavailable" : "Canceled"}</strong>{generation.error && <span>{operatorMessage(generation.error)}</span>}</div>}
        <Badge variant="secondary" className="media-generation-media-kind"><OperationIcon />{mediaLabel}</Badge>
        <Badge className="media-generation-origin"><Sparkles />AI</Badge>
        {usedCount > 0 && <OperatorTooltip label="Used in Timeline" detail={usedCount === 1 ? "This creation has one Timeline placement." : `This creation has ${usedCount} Timeline placements.`} side="bottom"><span className="media-generation-used" tabIndex={0}><CircleCheck /></span></OperatorTooltip>}
        {reportedCost && <Badge variant="secondary" className="media-generation-cost" title={`${reportedCost.basis === "actual" ? "Actual" : "Estimated"} cost`}>{reportedCost.basis === "estimated" ? "Est. " : ""}{formatMoney(reportedCost.value)}</Badge>}
        <div className="media-generation-menu"><DropdownMenu><DropdownMenuTrigger asChild><OperatorIconButton className="media-media-icon-action" label="More creation actions" size="icon-sm" variant="secondary"><MoreHorizontal /></OperatorIconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDetailsOpen(true)}><Eye />View details</DropdownMenuItem><DropdownMenuItem onSelect={onUseSettings}><SlidersHorizontal />Use settings</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(generation.preset.prompt)}><Copy />Copy prompt</DropdownMenuItem></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem disabled={!outputReady} onSelect={onPreview}><Eye />Preview</DropdownMenuItem><DropdownMenuItem onSelect={onRegenerate}><RotateCcw />Regenerate</DropdownMenuItem><DropdownMenuItem onSelect={onUseSettings}><WandSparkles />Remix</DropdownMenuItem><DropdownMenuItem disabled={!outputReady} onSelect={onAddToTimeline}><Plus />Add to Timeline</DropdownMenuItem>{onDismiss && <DropdownMenuItem onSelect={onDismiss}><X />Remove from Creations</DropdownMenuItem>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></div>
        {outputReady && <div className="media-generation-hover-actions">
          {onPreview && <OperatorIconButton className="media-media-icon-action" label="Preview creation" detail="Open the generated media and its technical details." variant="secondary" onClick={onPreview}><Eye /></OperatorIconButton>}
          {onAddToTimeline && <OperatorIconButton className="media-media-icon-action" label="Add creation to Timeline" detail="Place this generated result at the current playhead." variant="secondary" onClick={onAddToTimeline}><Plus /></OperatorIconButton>}
        </div>}
      </div>
    </article>
    {detailsDialog}
  </>
  return <article className={`media-generation-card${compact ? " is-creation-item" : ""}`} data-status={generation.status}>
    <div className="media-generation-preview" style={{ "--media-generation-ratio": ratio } as CSSProperties}>
      {running ? <Skeleton className="media-generation-skeleton" /> : outputFiles.length ? <div className="media-generation-outputs">{outputFiles.map((file) => <img key={file.id} src={file.media_type === "video" ? visualFilePosterUrl(file) : visualFileUrl(file)} alt="" />)}</div> : <div className="media-generation-result"><OperationIcon /><span>{operationLabel(operations, generation.preset.operation)}</span></div>}
      <Badge variant="secondary" className="media-generation-status">{generation.needs_confirmation ? "Approval needed" : generation.requires_review ? "Review needed" : generation.local_ingestion_pending ? "Saving failed" : saving ? "Saving" : generation.status === "queued" ? "Queued" : running ? "Generating" : loadingResult ? "Loading result" : ready ? "Ready" : generation.status === "failed" ? "Failed" : "Canceled"}</Badge>
      {compact && outputReady && <><span className="media-generation-ai" aria-label="AI generated"><Sparkles /></span><div className="media-generation-hover-actions">
        {onPreview && <OperatorIconButton label="Preview creation" detail="Open the generated media and its technical details." variant="secondary" onClick={onPreview}><Eye /></OperatorIconButton>}
        {onAddToTimeline && <OperatorIconButton label="Add creation to Timeline" detail="Place this generated result at the current playhead." onClick={onAddToTimeline}><Plus /></OperatorIconButton>}
      </div></>}
    </div>
    <div className="media-generation-copy">
      <header><div><strong>{generation.preset.prompt || operationLabel(operations, generation.preset.operation)}</strong><span>{generation.model_label} · {generation.preset.controls.ratio} · {generation.output_media_type === "image" ? generation.preset.controls.resolution : `${generation.preset.controls.duration}s · ${generation.preset.controls.resolution}`}</span></div>
        <DropdownMenu><DropdownMenuTrigger asChild><OperatorIconButton label="More generation actions" size="icon-xs"><MoreHorizontal /></OperatorIconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={() => setDetailsOpen(true)}><Eye />View request details</DropdownMenuItem><DropdownMenuItem onSelect={onUseSettings}><SlidersHorizontal />Use settings</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(generation.preset.prompt)}><Copy />Copy prompt</DropdownMenuItem>{compact && <><DropdownMenuSeparator /><DropdownMenuItem disabled={!outputReady} onSelect={onPreview}><Eye />Preview</DropdownMenuItem><DropdownMenuItem onSelect={onRegenerate}><RotateCcw />Regenerate</DropdownMenuItem><DropdownMenuItem onSelect={onUseSettings}><WandSparkles />Remix</DropdownMenuItem><DropdownMenuItem disabled={!outputReady} onSelect={onAddToTimeline}><Plus />Add to Timeline</DropdownMenuItem>{onDismiss && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={onDismiss}><X />Hide from Creations</DropdownMenuItem></>}</>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      </header>
      {running && <div className="media-generation-progress"><Progress value={hasMeasuredProgress ? generation.progress : undefined} /><span>{hasMeasuredProgress ? `${generation.progress}% · ` : ""}{elapsedLabel}</span></div>}
      {(generation.confirmation_message || generation.error) && <p className={generation.error ? "media-generation-error" : "media-generation-note"} role={generation.error ? "alert" : "status"}>{operatorMessage(generation.confirmation_message || generation.error)}</p>}
      <div className="media-generation-meta"><span><Sparkles />{operationLabel(operations, generation.preset.operation)}</span><span><Clock3 />{generation.created_at ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(generation.created_at)) : "Now"}</span></div>
      <footer>
        {running ? canCancel ? <Button variant="outline" size="sm" onClick={onCancel}><X />Cancel</Button> : null : generation.needs_confirmation ? <>
          <Button size="sm" disabled={working} onClick={onConfirm}>{working ? "Confirming…" : "Confirm and generate"}</Button>
          <Button variant="outline" size="sm" disabled={working} onClick={onUseSettings}><SlidersHorizontal />Review settings</Button>
        </> : generation.requires_review ? <Button variant="outline" size="sm" onClick={onUseSettings}><SlidersHorizontal />Review settings</Button> : generation.can_retry_ingestion ? <>
          <Button size="sm" disabled={working} onClick={onRetrySaving}>{working ? "Saving…" : "Retry saving"}</Button>
          <Button variant="outline" size="sm" disabled={working} onClick={onUseSettings}><SlidersHorizontal />Use settings</Button>
        </> : loadingResult ? <Button variant="outline" size="sm" disabled>Loading result…</Button> : compact ? outputReady ? null : <>
          <Button variant="outline" size="sm" onClick={onRegenerate}><RotateCcw />Regenerate</Button>
          <Button variant="outline" size="sm" onClick={onUseSettings}><WandSparkles />Remix</Button>
        </> : <>
          <OperatorTooltip label="Preview" detail={outputReady ? "Open the generated media and its technical details." : "The generated media is still being saved."} disabledTrigger={!outputReady}><Button variant="outline" size="sm" disabled={!outputReady} onClick={onPreview}><Eye />Preview</Button></OperatorTooltip>
          <Button variant="outline" size="sm" onClick={onRegenerate}><RotateCcw />Regenerate</Button>
          <Button variant="outline" size="sm" onClick={onUseSettings}><WandSparkles />Remix</Button>
          <OperatorTooltip label="Add to Timeline" detail={outputReady ? "Place the first generated result at the current playhead." : "The generated media is still being saved."} disabledTrigger={!outputReady}><Button size="sm" disabled={!outputReady} onClick={onAddToTimeline}>Add to Timeline</Button></OperatorTooltip>
        </>}
      </footer>
    </div>
    {detailsDialog}
  </article>
}
