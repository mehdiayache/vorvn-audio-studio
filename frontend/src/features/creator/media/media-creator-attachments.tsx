import { useState } from "react"
import { ArrowLeftRight, AudioLines, Expand, Film, ImagePlus, Plus, Replace, Trash2 } from "lucide-react"

import type { AttachmentChipStatus } from "@/components/ai/attachment-chip"
import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { attachmentRoleLabel, type MediaAttachmentKind, type MediaAttachmentRole, type MediaOperationCapability } from "./media-creator-config"

export type MediaCreatorAttachment = {
  id: string
  name: string
  kind: MediaAttachmentKind
  role: MediaAttachmentRole
  roleLabel?: string
  previewUrl?: string | null
  posterUrl?: string | null
  durationLabel?: string | null
  file?: File
  fileId?: number
  status?: AttachmentChipStatus
  progress?: number
  error?: string
  nested?: {
    fieldKey: string
    groupIndex: number
    listKey: "file_ids" | "audio_file_ids"
    fileId: number
  }
}

type InputSlot = MediaOperationCapability["inputs"][number]

function mediaNoun(mediaTypes: InputSlot["media_types"]) {
  if (mediaTypes.length !== 1) return "media"
  return mediaTypes[0] === "image" ? "image" : mediaTypes[0] === "video" ? "video" : "audio"
}

function SlotIcon({ kind }: { kind: MediaAttachmentKind | undefined }) {
  const Icon = kind === "audio" ? AudioLines : kind === "video" ? Film : ImagePlus
  return <Icon aria-hidden="true" />
}

function AttachmentActions({ label, onAdd, onPreview, onRemove }: {
  label: string
  onAdd?: () => void
  onPreview: () => void
  onRemove: () => void
}) {
  return <div className="media-attachment-actions">
    <OperatorIconButton type="button" className="media-media-icon-action" label={`Open ${label.toLowerCase()}`} detail="Preview this input at its full available size." side="bottom" variant="secondary" onClick={onPreview}><Expand /></OperatorIconButton>
    {onAdd && <OperatorIconButton type="button" className="media-media-icon-action" label={`Replace ${label.toLowerCase()}`} detail="Choose another compatible File from this Workspace or upload a new one." side="bottom" variant="secondary" onClick={onAdd}><Replace /></OperatorIconButton>}
    <OperatorIconButton type="button" className="media-media-icon-action" label={`Remove ${label.toLowerCase()}`} detail="Removes this input from the current creation only." side="bottom" variant="secondary" onClick={onRemove}><Trash2 /></OperatorIconButton>
  </div>
}

function VisualSlot({ slot, attachment, onAdd, onPreview, onRemove }: {
  slot: InputSlot
  attachment?: MediaCreatorAttachment
  onAdd?: (role: MediaAttachmentRole) => void
  onPreview: (attachment: MediaCreatorAttachment) => void
  onRemove: (attachment: MediaCreatorAttachment) => void
}) {
  const preview = attachment?.posterUrl || attachment?.previewUrl
  return <section className="media-visual-slot" data-filled={attachment ? "true" : "false"} data-required={slot.required ? "true" : "false"}>
    <header><span>{slot.label}</span><small>{slot.required ? "Required" : "Optional"}</small></header>
    <div className="media-visual-slot-media">
      {preview ? <button type="button" className="media-attachment-preview-target" aria-label={`Open ${slot.label.toLowerCase()}: ${attachment?.name}`} onClick={() => attachment && onPreview(attachment)}><img src={preview} alt="" /></button> : attachment ? <span role="img" aria-label={`${slot.label}: ${attachment.name}`}><SlotIcon kind={attachment.kind} /></span> : null}
      {!attachment && <Button type="button" variant="ghost" className="media-visual-slot-empty" aria-label={`Choose ${mediaNoun(slot.media_types)} for ${slot.label}`} onClick={() => onAdd?.(slot.role)}>
        <Plus /><span>Add {slot.label.toLowerCase()}</span>
      </Button>}
      {attachment && <AttachmentActions label={slot.label} onAdd={() => onAdd?.(slot.role)} onPreview={() => onPreview(attachment)} onRemove={() => onRemove(attachment)} />}
    </div>
  </section>
}

function ReferenceTile({ attachment, label, onPreview, onRemove }: {
  attachment: MediaCreatorAttachment
  label: string
  onPreview: () => void
  onRemove: () => void
}) {
  const preview = attachment.posterUrl || attachment.previewUrl
  return <div className="media-reference-tile" data-kind={attachment.kind}>
    <button type="button" className="media-attachment-preview-target" aria-label={`Open ${label.toLowerCase()}: ${attachment.name}`} onClick={onPreview}>
      {preview ? <img src={preview} alt="" /> : <SlotIcon kind={attachment.kind} />}
    </button>
    <AttachmentActions label={label} onPreview={onPreview} onRemove={onRemove} />
  </div>
}

function FramePair({ slots, attachments, onAdd, onPreview, onRemove, onSwapFrames }: {
  slots: [InputSlot, InputSlot]
  attachments: MediaCreatorAttachment[]
  onAdd?: (role: MediaAttachmentRole) => void
  onPreview: (attachment: MediaCreatorAttachment) => void
  onRemove: (attachment: MediaCreatorAttachment) => void
  onSwapFrames?: () => void
}) {
  const [start, end] = slots
  const startAttachment = attachments.find(({ role }) => role === start.role)
  const endAttachment = attachments.find(({ role }) => role === end.role)
  return <div className="media-frame-pair" aria-label="Start and end frames">
    <VisualSlot slot={start} attachment={startAttachment} onAdd={onAdd} onPreview={onPreview} onRemove={onRemove} />
    <div className="media-frame-swap"><OperatorIconButton type="button" label="Swap start and end frames" detail="Exchanges the semantic start and end roles without duplicating media." disabled={!startAttachment && !endAttachment} onClick={onSwapFrames}><ArrowLeftRight /></OperatorIconButton></div>
    <VisualSlot slot={end} attachment={endAttachment} onAdd={onAdd} onPreview={onPreview} onRemove={onRemove} />
  </div>
}

export function MediaCreatorAttachments({ capability, attachments, onAdd, onRemove, onSwapFrames }: {
  capability: MediaOperationCapability
  attachments: MediaCreatorAttachment[]
  missingRoles?: MediaAttachmentRole[]
  onAdd?: (role: MediaAttachmentRole) => void
  onRemove: (attachment: MediaCreatorAttachment) => void
  onSwapFrames?: () => void
}) {
  const [previewAttachment, setPreviewAttachment] = useState<MediaCreatorAttachment | null>(null)
  if (!capability.inputs.length && !attachments.length) return null
  const direct = attachments.filter(({ nested }) => !nested)
  const nested = attachments.filter(({ nested }) => nested)
  const startFrame = capability.inputs.find(({ role }) => role === "start-frame")
  const endFrame = capability.inputs.find(({ role }) => role === "end-frame")
  const pairedRoles = new Set(startFrame && endFrame ? [startFrame.role, endFrame.role] : [])
  const previewUrl = previewAttachment?.previewUrl || previewAttachment?.posterUrl

  return <>
    <div className="media-reference-slots" aria-label="Generation inputs">
      {startFrame && endFrame && <FramePair slots={[startFrame, endFrame]} attachments={direct} onAdd={onAdd} onPreview={setPreviewAttachment} onRemove={onRemove} onSwapFrames={onSwapFrames} />}
      {capability.inputs.filter(({ role }) => !pairedRoles.has(role)).map((slot) => {
        const assigned = direct.filter(({ role }) => role === slot.role)
        if (slot.max === 1 && slot.media_types.length === 1) return <VisualSlot key={slot.role} slot={slot} attachment={assigned[0]} onAdd={onAdd} onPreview={setPreviewAttachment} onRemove={onRemove} />
        return <section className="media-reference-slot" key={slot.role} data-required={slot.required ? "true" : "false"}>
          <header><span>{slot.label}</span><small>{slot.required ? "Required" : `Optional · ${assigned.length}/${slot.max}`}</small></header>
          <div className="media-reference-media-grid">
            {assigned.map((attachment) => <ReferenceTile key={attachment.id} attachment={attachment} label={slot.label} onPreview={() => setPreviewAttachment(attachment)} onRemove={() => onRemove(attachment)} />)}
            {assigned.length < slot.max && <Button type="button" variant="outline" className="media-attachment-slot" aria-label={`Choose ${mediaNoun(slot.media_types)}${slot.max > 1 ? "s" : ""} for ${slot.label}`} onClick={() => onAdd?.(slot.role)}><Plus /><span>{assigned.length ? "Add" : `Add ${mediaNoun(slot.media_types)}`}</span></Button>}
          </div>
        </section>
      })}
      {nested.length > 0 && <section className="media-reference-slot"><header><span>Directed subjects</span><small>{nested.length}</small></header><div className="media-reference-media-grid">{nested.map((attachment) => <ReferenceTile key={attachment.id} attachment={attachment} label={attachment.roleLabel || attachmentRoleLabel(capability, attachment.role)} onPreview={() => setPreviewAttachment(attachment)} onRemove={() => onRemove(attachment)} />)}</div></section>}
    </div>
    <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => { if (!open) setPreviewAttachment(null) }}>
      <DialogContent className="media-attachment-preview-dialog">
        <DialogHeader><DialogTitle>{previewAttachment?.roleLabel || previewAttachment?.name || "Creation input"}</DialogTitle><DialogDescription>Preview of the media attached to this creation input.</DialogDescription></DialogHeader>
        <div className="media-attachment-preview-media">{previewAttachment?.kind === "video" && previewUrl ? <video src={previewUrl} controls autoPlay playsInline /> : previewAttachment?.kind === "audio" && previewUrl ? <audio src={previewUrl} controls autoPlay /> : previewUrl ? <img src={previewUrl} alt="" /> : <SlotIcon kind={previewAttachment?.kind} />}</div>
      </DialogContent>
    </Dialog>
  </>
}
