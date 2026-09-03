import { CircleCheck, Clock3, Expand, Image as ImageIcon, LoaderCircle, MoreHorizontal, Plus, X, Video } from "lucide-react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { FileSourceIndicator } from "@/components/file-source-indicator"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WorkspaceFile } from "@/types/domain"
import { visualFileFacts, visualFileName, visualFilePlaybackUrl, visualFilePosterUrl, visualFileUrl } from "@/features/creator/library/visual-file-presentation"

export function VisualFileCard({ file, mode = "project-library", pending = false, addLabel = "Add", usedCount = 0, onPreview, onAdd, onAddToProject, onAddToTimeline, onRemove }: {
  file: WorkspaceFile
  mode?: "project-library" | "workspace-library"
  pending?: boolean
  addLabel?: string
  usedCount?: number
  onPreview: (file: WorkspaceFile) => void
  onAdd?: (file: WorkspaceFile) => void
  onAddToProject?: (file: WorkspaceFile) => void
  onAddToTimeline?: (file: WorkspaceFile) => void
  onRemove?: (file: WorkspaceFile) => void
}) {
  const name = visualFileName(file)
  const url = visualFileUrl(file)
  const facts = visualFileFacts(file)
  const ratio = file.width && file.height ? `${file.width} / ${file.height}` : "4 / 3"
  const actionButtons = mode === "project-library" ? <>
    <OperatorIconButton label={`Preview ${name}`} detail="Open the full media preview and technical details." side="bottom" variant="secondary" onClick={() => onPreview(file)}><Expand /></OperatorIconButton>
    {onAddToProject && <OperatorIconButton label={`Add ${name} to this Project`} detail="Associates this Workspace File with the current Project." side="bottom" variant="secondary" busy={pending} busyLabel={`Adding ${name}…`} onClick={() => onAddToProject(file)}><Plus /></OperatorIconButton>}
    {onAddToTimeline && <OperatorIconButton label={`Add ${name} to Timeline`} detail="Places this visual at the current playhead." side="bottom" variant="secondary" busy={pending} busyLabel={`Adding ${name}…`} onClick={() => onAddToTimeline(file)}><Plus /></OperatorIconButton>}
    <DropdownMenu>
      <OperatorTooltip label={pending ? "Updating visual" : `More actions for ${name}`} side="bottom" disabledTrigger={pending}>
        <DropdownMenuTrigger asChild><Button variant="secondary" size="icon-sm" disabled={pending} aria-label={`Actions for ${name}`}>{pending ? <LoaderCircle className="spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger>
      </OperatorTooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onPreview(file)}><Expand /> Preview details</DropdownMenuItem>
          {onAddToProject && <DropdownMenuItem onSelect={() => onAddToProject(file)}><Plus /> Add to this Project</DropdownMenuItem>}
          {onAddToTimeline && <DropdownMenuItem onSelect={() => onAddToTimeline(file)}><Plus /> Add to Timeline</DropdownMenuItem>}
        </DropdownMenuGroup>
        {onRemove && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onRemove(file)}><X /> Remove from Project…</DropdownMenuItem></DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>
  </> : null
  return <article className="visual-file-card" data-media-type={file.media_type}>
    <div className="visual-file-preview" style={{ aspectRatio: ratio }}>
      <button className="visual-file-preview-target" onClick={() => onPreview(file)} aria-label={`Preview ${name}`}>
        {file.media_type === "video"
          ? <video src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} muted playsInline loop preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0 }} />
          : <img src={url} alt="" loading="lazy" decoding="async" />}
      </button>
      <span className="visual-file-kind">{file.media_type === "video" ? <Video /> : <ImageIcon />}{file.media_type === "video" ? "Video" : "Image"}</span>
      {facts.duration && <span className="visual-file-duration"><Clock3 />{facts.duration}</span>}
      <FileSourceIndicator file={file} className="visual-file-origin" showLabel />
      {usedCount > 0 && <OperatorTooltip label="Used in Timeline" detail={usedCount === 1 ? "This media has one Timeline placement." : `This media has ${usedCount} Timeline placements.`} side="bottom"><span className="visual-file-used" tabIndex={0}><CircleCheck /></span></OperatorTooltip>}
      {actionButtons && <div className="visual-file-hover-actions">{actionButtons}</div>}
    </div>
    {mode === "workspace-library" && <footer>
      <div><h3 title={name}>{name}</h3><p>{facts.dimensions} · {facts.format}</p></div>
      {onAdd
        ? <ActionButton size="sm" busy={pending} busyLabel="Adding…" onClick={() => onAdd(file)}><Plus /> {addLabel}</ActionButton>
        : null}
    </footer>}
  </article>
}
