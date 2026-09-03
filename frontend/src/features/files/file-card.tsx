import {
  Archive, AudioLines, Captions, Clock3, Database, Expand,
  FileText, Image as ImageIcon, Pause, Play, Video,
} from "lucide-react"
import type { ReactNode } from "react"

import { FileSourceIndicator } from "@/components/file-source-indicator"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { cn } from "@/lib/utils"
import type { WorkspaceFile } from "@/types/domain"
import { fileDisplayName, fileDisplayUrl, fileFacts, filePlaybackUrl, filePosterUrl, type FileKind } from "./file-presentation"

import "./file-card.css"

export type FileCardInteraction = {
  onInvoke: () => void
  selected?: boolean
}

export type FileCardAudition = {
  playing: boolean
  onToggle: () => void
}

export type FileCardSlots = {
  state?: ReactNode
  actions?: ReactNode
}

const KIND_ICONS: Record<FileKind, typeof FileText> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  speech: AudioLines,
  music: AudioLines,
  sfx: AudioLines,
  subtitle: Captions,
  document: FileText,
  data: Database,
  other: Archive,
}

function FileMediaStage({ file, onPreview, audition }: {
  file: WorkspaceFile
  onPreview?: () => void
  audition?: FileCardAudition
}) {
  const name = fileDisplayName(file)
  const url = fileDisplayUrl(file)
  const facts = fileFacts(file)
  const Icon = KIND_ICONS[facts.kind]
  const visual = facts.kind === "image" || facts.kind === "video"
  const content = visual && url
    ? facts.kind === "video"
      ? <video src={filePlaybackUrl(file)} poster={filePosterUrl(file)} muted playsInline loop preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0 }} />
      : <img src={url} alt="" loading="lazy" decoding="async" />
    : <span className="file-card-symbol"><Icon /><b>{facts.kindLabel}</b></span>
  return <div className="file-card-stage" style={{ aspectRatio: file.width && file.height ? `${file.width} / ${file.height}` : "4 / 3" }}>
    {onPreview
      ? <button className="file-card-stage-target" type="button" aria-label={`Preview ${name}`} onClick={onPreview}>{content}</button>
      : <div className="file-card-stage-target" aria-hidden="true">{content}</div>}
    <span className="file-card-kind"><Icon />{facts.kindLabel}</span>
    {facts.duration && <span className="file-card-duration"><Clock3 />{facts.duration}</span>}
    <FileSourceIndicator file={file} className="file-card-origin" showLabel />
    {onPreview && visual && <OperatorIconButton className="file-card-preview-action" label={`Preview ${name}`} detail="Open the full media preview and technical details." side="bottom" variant="secondary" onClick={onPreview}><Expand /></OperatorIconButton>}
    {audition && url && <span className="file-card-audition"><OperatorIconButton data-playing={audition.playing || undefined} label={audition.playing ? `Pause ${name}` : `Audition ${name}`} detail="Auditioning does not place this audio." variant="secondary" onClick={audition.onToggle}>{audition.playing ? <Pause /> : <Play />}</OperatorIconButton></span>}
  </div>
}

export function FileCard({ file, interaction, preview, audition, slots }: {
  file: WorkspaceFile
  interaction?: FileCardInteraction
  preview?: { onOpen: () => void }
  audition?: FileCardAudition
  slots?: FileCardSlots
}) {
  const name = fileDisplayName(file)
  const facts = fileFacts(file)
  const audio = ["audio", "speech", "music", "sfx"].includes(facts.kind)
  const detail = [facts.category && facts.category !== facts.kind ? facts.category : null, facts.dimensions, facts.format].filter(Boolean).join(" · ")
  const tags = audio ? facts.tags.slice(0, 2) : []
  const remainingTags = audio ? facts.tags.slice(2) : []
  const identity = <><b title={name}>{name}</b><small>{detail || facts.kindLabel}</small></>
  return <article className={cn("file-card", `is-${facts.kind}`, interaction?.selected && "is-selected")} data-audio-family={audio ? facts.audioFamily : undefined} data-file-id={file.id} data-file-name={name}>
    <FileMediaStage file={file} onPreview={preview?.onOpen} audition={audio ? audition : undefined} />
    <footer className="file-card-footer">
      {interaction
        ? <button type="button" className="file-card-identity" aria-label={`Select ${name}`} aria-pressed={interaction.selected} onClick={interaction.onInvoke}>{identity}</button>
        : <div className="file-card-identity">{identity}</div>}
      {tags.length > 0 && <div className="file-card-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}{remainingTags.length > 0 && <OperatorTooltip label={`${remainingTags.length} more tag${remainingTags.length === 1 ? "" : "s"}`} detail={remainingTags.join(" · ")} side="bottom"><span tabIndex={0}>+{remainingTags.length}</span></OperatorTooltip>}</div>}
      {(slots?.state || slots?.actions) && <div className="file-card-context">{slots.state}{slots.actions}</div>}
    </footer>
  </article>
}
