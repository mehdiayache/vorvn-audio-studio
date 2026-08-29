import { useEffect, useRef, useState } from "react"
import {
  AudioLines, Check, ChevronDown, CircleAlert, Clock3, FileJson2, ListOrdered,
  Download, LoaderCircle, MoreHorizontal, Pause, PencilLine, Play, Plus, Sparkles, Trash2, Video,
} from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { ToolKind } from "@/components/production-tools"
import type { ProductionMutationStatus } from "@/hooks/use-production-actions"
import { formatDuration, formatMoney } from "@/lib/format"
import type { HierarchyNode, Production } from "@/types/domain"
import { WORKSTATION_STAGES, type WorkstationStage } from "./workstation-workflow"

export function InlineProductionName({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const cancelOnBlur = useRef(false)

  useEffect(() => { if (!editing) setValue(name) }, [editing, name])

  async function commit() {
    const next = value.trim()
    if (!next) { setError("Name cannot be empty."); return }
    if (next === name) { setEditing(false); setError(""); return }
    setSaving(true); setError("")
    try { await onRename(next); setEditing(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The Production name could not be saved.") }
    finally { setSaving(false) }
  }

  return <div className="ws-inline-name">
    <h1>{editing ? <Input
      aria-label="Production name"
      autoFocus
      disabled={saving}
      maxLength={160}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (cancelOnBlur.current) { cancelOnBlur.current = false; setEditing(false); setError(""); return }
        void commit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") { cancelOnBlur.current = true; setValue(name); event.currentTarget.blur() }
      }}
    /> : <button type="button" onClick={() => setEditing(true)} aria-label={`Rename Production ${name}`}>{name}<PencilLine aria-hidden="true" /></button>}</h1>
    {error && <span role="alert">{error}</span>}
  </div>
}

export function WorkstationHeader({ production, tree, duration, stage, issueCount, previewing, playing, mutationStatus, onStage, onPreview, onExport, onAdd, onDelete, onRename }: {
  production: Production
  tree: HierarchyNode[] | null
  duration: number
  stage: WorkstationStage
  issueCount: number
  previewing: boolean
  playing: boolean
  mutationStatus: ProductionMutationStatus
  onStage: (stage: WorkstationStage) => void
  onPreview: () => void
  onExport: () => void
  onAdd: (kind: Exclude<ToolKind, null>) => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}) {
  const partCount = production.parts.filter((part) => part.kind !== "stitch").length
  const formattedDuration = formatDuration(duration)
  const videoSpend = Number(production.accounting.video_spend || 0)
  const audioSpend = Number(production.accounting.audio_spend ?? Math.max(0, production.total_cost - videoSpend))
  const productionNode = tree?.find((item) => item.type === "production" && Number(item.id) === Number(production.id))
  return <header className="ws-header">
    <div className="ws-context-rail">
      <ShellBreadcrumbs trail={production.trail} current={{ type: "production", id: production.id, public_id: production.public_id, name: production.name, icon: productionNode?.icon || undefined }} tree={tree} />
    </div>
    <div className="ws-header-context">
      <InlineProductionName name={production.name} onRename={onRename} />
      <dl className="ws-production-facts">
        <OperatorTooltip label={`${partCount} ${partCount === 1 ? "Part" : "Parts"}`} detail="Narration, pauses and linked audio in this Script."><div><ListOrdered aria-hidden="true" /><dd>{partCount}</dd><dt>Parts</dt></div></OperatorTooltip>
        <OperatorTooltip label={`Duration ${formattedDuration}`} detail="Current Production timeline duration."><div><Clock3 aria-hidden="true" /><dd>{formattedDuration}</dd><dt>Duration</dt></div></OperatorTooltip>
      </dl>
      <dl className="ws-spending" aria-label="Production spending">
        <dt>Spending</dt>
        <OperatorTooltip label={`Audio spend ${formatMoney(audioSpend)}`} detail="Provider spend for speech and audio work in this Production."><div><AudioLines aria-hidden="true" /><dd>{formatMoney(audioSpend)}</dd></div></OperatorTooltip>
        <OperatorTooltip label={`Video spend ${formatMoney(videoSpend)}`} detail="Provider spend for Director image and video generations."><div><Video aria-hidden="true" /><dd>{formatMoney(videoSpend)}</dd></div></OperatorTooltip>
      </dl>
      {production.status && production.status !== "draft" && <span className="ws-status">{production.status.replaceAll("_", " ")}</span>}
      {mutationStatus !== "idle" && <span className={`ws-save-state is-${mutationStatus}`} role="status" aria-live="polite">{mutationStatus === "saving" ? <LoaderCircle className="spin" /> : <Check />}{mutationStatus === "saving" ? "Saving…" : "Saved"}</span>}
    </div>
    <nav className="ws-workflow" aria-label="Production workflow">
      {WORKSTATION_STAGES.map((item) => {
        const Icon = item.icon
        return <OperatorTooltip key={item.id} label={item.label} detail={item.description} side="bottom"><button className={stage === item.id ? "is-active" : ""} aria-current={stage === item.id ? "page" : undefined} aria-label={`${item.label} · ${item.description}`} onClick={() => onStage(item.id)}><Icon /><b>{item.label}</b><small className="sr-only">{item.description}</small></button></OperatorTooltip>
      })}
    </nav>
    <div className="ws-header-actions">
      <div className="ws-action-buttons">
        {issueCount > 0 && <Button variant="outline" size="sm" onClick={onExport}><CircleAlert className="ws-warning-icon" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</Button>}
        <Button variant="outline" size="sm" disabled={previewing} onClick={onPreview}>{previewing ? <LoaderCircle className="spin" /> : playing ? <Pause /> : <Play />}{previewing ? "Preparing…" : playing ? "Pause" : "Preview"}</Button>
        <Button variant="outline" size="sm" onClick={onExport}><Download /> Export</Button>
        {stage === "sequence" && <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onAdd("speech")}><AudioLines /> Speech</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("silence")}><Pause /> Pause</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("asset")}><Sparkles /> Linked audio</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onAdd("import")}><FileJson2 /> Import JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        <DropdownMenu><OperatorTooltip label="More Production actions" detail="Contains permanent Production deletion."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More Production actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete Production permanently</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </div>
  </header>
}
