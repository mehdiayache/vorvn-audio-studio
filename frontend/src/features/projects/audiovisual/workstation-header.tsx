import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  AudioLines, Check, ChevronDown, CircleAlert, Clock3, FileJson2, ListOrdered,
  Download, LoaderCircle, MoreHorizontal, Pause, PencilLine, Play, Plus, Sparkles, Trash2, Video,
} from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { ProjectToolKind } from "@/features/projects/audiovisual/project-tools"
import type { ProjectMutationStatus } from "@/hooks/use-project-actions"
import { formatDuration, formatMoney } from "@/lib/format"
import type { Project } from "@/types/domain"
import { WORKSTATION_STAGES, type WorkstationStage } from "./workstation-workflow"

export function InlineProjectName({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
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
    catch (reason) { setError(reason instanceof Error ? reason.message : "The Project name could not be saved.") }
    finally { setSaving(false) }
  }

  return <div className="ws-inline-name">
    <h1>{editing ? <Input
      aria-label="Project name"
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
    /> : <button type="button" onClick={() => setEditing(true)} aria-label={`Rename Project ${name}`}>{name}<PencilLine aria-hidden="true" /></button>}</h1>
    {error && <span role="alert">{error}</span>}
  </div>
}

export function WorkstationHeader({ project, duration, stage, issueCount, previewing, playing, mutationStatus, onStage, onPreview, onExport, onAdd, onDelete, onRename }: {
  project: Project
  duration: number
  stage: WorkstationStage
  issueCount: number
  previewing: boolean
  playing: boolean
  mutationStatus: ProjectMutationStatus
  onStage: (stage: WorkstationStage) => void
  onPreview: () => void
  onExport: () => void
  onAdd: (kind: Exclude<ProjectToolKind, null>) => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}) {
  const partCount = project.parts.filter((part) => part.kind !== "stitch").length
  const formattedDuration = formatDuration(duration)
  const videoSpend = Number(project.accounting.video_spend ?? 0)
  const audioSpend = Number(project.accounting.audio_spend ?? 0)
  const otherSpend = Number(project.accounting.other_spend ?? 0)
  return <header className="ws-header">
    <div className="ws-context-rail">
      <nav className="ws-project-breadcrumbs" aria-label="Project location">
        <Link to="/origins/">Origins</Link><span aria-hidden="true">/</span>
        <Link to="/origins/projects">Projects</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{project.name}</span>
      </nav>
    </div>
    <div className="ws-header-context">
      <InlineProjectName name={project.name} onRename={onRename} />
      <dl className="ws-project-facts">
        <OperatorTooltip label={`${partCount} ${partCount === 1 ? "Part" : "Parts"}`} detail="Narration, pauses and linked audio in this Script."><div><ListOrdered aria-hidden="true" /><dd>{partCount}</dd><dt>Parts</dt></div></OperatorTooltip>
        <OperatorTooltip label={`Duration ${formattedDuration}`} detail="Current Project timeline duration."><div><Clock3 aria-hidden="true" /><dd>{formattedDuration}</dd><dt>Duration</dt></div></OperatorTooltip>
      </dl>
      <dl className="ws-spending" aria-label="Project spending">
        <dt>Spending</dt>
        <OperatorTooltip label={`Audio spend ${formatMoney(audioSpend)}`} detail="Provider spend for speech and audio work in this Project."><div><AudioLines aria-hidden="true" /><dd>{formatMoney(audioSpend)}</dd></div></OperatorTooltip>
        <OperatorTooltip label={`Video spend ${formatMoney(videoSpend)}`} detail="Provider spend for image and video generations."><div><Video aria-hidden="true" /><dd>{formatMoney(videoSpend)}</dd></div></OperatorTooltip>
        <OperatorTooltip label={`Other spend ${formatMoney(otherSpend)}`} detail="Translation, transcription, text preparation, rendering and other paid operations."><div><MoreHorizontal aria-hidden="true" /><dd>{formatMoney(otherSpend)}</dd></div></OperatorTooltip>
      </dl>
      {project.status && project.status !== "draft" && <span className="ws-status">{project.status.replaceAll("_", " ")}</span>}
      {mutationStatus !== "idle" && <span className={`ws-save-state is-${mutationStatus}`} role="status" aria-live="polite">{mutationStatus === "saving" ? <LoaderCircle className="spin" /> : <Check />}{mutationStatus === "saving" ? "Saving…" : "Saved"}</span>}
    </div>
    <nav className="ws-workflow" aria-label="Project workflow">
      {WORKSTATION_STAGES.map((item) => {
        const Icon = item.icon
        return <OperatorTooltip key={item.id} label={item.label} detail={item.description} side="bottom"><button className={stage === item.id ? "is-active" : ""} aria-current={stage === item.id ? "page" : undefined} aria-label={`${item.label} · ${item.description}`} onClick={() => onStage(item.id)}><Icon /><b>{item.label}</b><small className="sr-only">{item.description}</small></button></OperatorTooltip>
      })}
    </nav>
    <div className="ws-header-actions">
      <div className="ws-action-buttons">
        {issueCount > 0 && <Button variant="outline" size="sm" onClick={onExport}><CircleAlert className="ws-warning-icon" /> {issueCount} issue{issueCount === 1 ? "" : "s"}</Button>}
        <Button variant="outline" size="sm" disabled={previewing} onClick={onPreview}>{previewing ? <LoaderCircle className="spin" /> : playing ? <Pause /> : <Play />}{previewing ? "Preparing…" : playing ? "Pause" : "Review"}</Button>
        <Button variant="outline" size="sm" onClick={onExport}><Download /> Export</Button>
        {stage === "sequence" && <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus /> Add <ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onAdd("speech")}><AudioLines /> Speech</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("silence")}><Pause /> Pause</DropdownMenuItem><DropdownMenuItem onSelect={() => onAdd("file")}><Sparkles /> Linked audio</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onAdd("import")}><FileJson2 /> Import JSON</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        <DropdownMenu><OperatorTooltip label="More Project actions" detail="Contains permanent Project deletion."><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="More Project actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 /> Delete Project permanently</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </div>
  </header>
}
