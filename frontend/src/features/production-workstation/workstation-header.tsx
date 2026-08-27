import { useEffect, useRef, useState } from "react"
import {
  AudioLines, Check, ChevronDown, ChevronRight, CircleAlert, FileJson2,
  LoaderCircle, MoreHorizontal, Pause, PencilLine, Play, Plus, Sparkles, Trash2,
} from "lucide-react"
import { Link } from "react-router-dom"

import { AudioStudioRailToggle } from "@/components/app-shell"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { ToolKind } from "@/components/production-tools"
import type { ProductionMutationStatus } from "@/hooks/use-production-actions"
import { formatDuration, formatMoney } from "@/lib/format"
import { audioStudioBase, resourceHref } from "@/lib/links"
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

function ProductionParentSwitcher({ production, tree }: { production: Production; tree: HierarchyNode[] | null }) {
  const parent = production.trail.at(-1)
  if (!parent) return <Link className="ws-parent-link" to={`${audioStudioBase}/projects/${production.project_id}`}>Project</Link>
  const parentNode = tree?.find((item) => item.type === parent.type && item.id === parent.id)
  const peers = parentNode
    ? (tree || []).filter((item) => item.type === parent.type && item.parent_key === parentNode.parent_key)
      .sort((left, right) => left.name.localeCompare(right.name))
    : []
  const options = peers.length ? peers : [parent]
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="ws-parent-switcher" aria-label={`Switch ${parent.type}`}>
        <span>{parent.name}</span><ChevronDown aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="ws-parent-menu">
      <DropdownMenuLabel>Switch {parent.type}</DropdownMenuLabel>
      {options.map((item) => {
        const current = item.id === parent.id
        return <DropdownMenuItem key={`${item.type}:${item.id}`} asChild>
          <Link to={resourceHref(item.type, item.public_id)}><span>{item.name}</span>{current && <Check aria-label="Current" />}</Link>
        </DropdownMenuItem>
      })}
    </DropdownMenuContent>
  </DropdownMenu>
}

export function WorkstationHeader({ production, tree, duration, stage, issueCount, previewing, playing, mutationStatus, onStage, onPreview, onAdd, onDelete, onRename }: {
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
  onAdd: (kind: Exclude<ToolKind, null>) => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}) {
  const partCount = production.parts.filter((part) => part.kind !== "stitch").length
  const formattedDuration = formatDuration(duration)
  const currentCost = formatMoney(production.current_sequence_cost)
  return <header className="ws-header">
    <div className="ws-header-context">
      <AudioStudioRailToggle className="ws-shell-toggle" tooltipSide="bottom" />
      <ProductionParentSwitcher production={production} tree={tree} />
      <ChevronRight className="ws-breadcrumb-separator" aria-hidden="true" />
      <InlineProductionName name={production.name} onRename={onRename} />
      <dl><div aria-label={`${partCount} Parts`}><dt>Parts</dt><dd>{partCount}</dd></div><div aria-label={`Duration ${formattedDuration}`}><dt>Duration</dt><dd>{formattedDuration}</dd></div><div aria-label={`Current cost ${currentCost}`}><dt title="Cost of audio currently active in this Script">Current cost</dt><dd>{currentCost}</dd></div></dl>
      {production.status && production.status !== "draft" && <span className="ws-status">{production.status.replaceAll("_", " ")}</span>}
      {mutationStatus !== "idle" && <span className={`ws-save-state is-${mutationStatus}`} role="status" aria-live="polite">{mutationStatus === "saving" ? <LoaderCircle className="spin" /> : <Check />}{mutationStatus === "saving" ? "Saving…" : "Saved"}</span>}
    </div>
    <nav className="ws-workflow" aria-label="Production workflow">
      {WORKSTATION_STAGES.map((item, index) => {
        const Icon = item.icon
        return <OperatorTooltip key={item.id} label={item.label} detail={item.description} side="bottom"><button className={stage === item.id ? "is-active" : ""} aria-current={stage === item.id ? "step" : undefined} aria-label={`${index + 1} ${item.label} · ${item.description}`} onClick={() => onStage(item.id)}><span>{index + 1}</span><Icon /><b>{item.label}</b><small className="sr-only">{item.description}</small></button></OperatorTooltip>
      })}
    </nav>
    <div className="ws-header-actions">
      <div className="ws-action-buttons">
        {issueCount > 0 && <Button variant="outline" size="sm" onClick={() => onStage("mix")}><CircleAlert className="ws-warning-icon" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</Button>}
        <Button variant="outline" size="sm" disabled={previewing} onClick={onPreview}>{previewing ? <LoaderCircle className="spin" /> : playing ? <Pause /> : <Play />}{previewing ? "Preparing…" : playing ? "Pause" : "Preview"}</Button>
        {stage === "sequence" && <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onAdd("speech")}><AudioLines /> Speech</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("silence")}><Pause /> Pause</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("asset")}><Sparkles /> Linked audio</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onAdd("import")}><FileJson2 /> Import JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        <DropdownMenu><OperatorTooltip label="More Production actions" detail="Contains permanent Production deletion."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More Production actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete Production permanently</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </div>
  </header>
}
