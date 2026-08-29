import { Plus } from "lucide-react"

import { AttachmentChip, type AttachmentChipStatus } from "@/components/ai/attachment-chip"
import { Button } from "@/components/ui/button"
import { attachmentRoleLabel, type DirectorAttachmentKind, type DirectorAttachmentRole, type DirectorOperationCapability } from "./director-composer-config"

export type DirectorComposerAttachment = {
  id: string
  name: string
  kind: DirectorAttachmentKind
  role: DirectorAttachmentRole
  roleLabel?: string
  previewUrl?: string | null
  posterUrl?: string | null
  durationLabel?: string | null
  file?: File
  assetId?: number
  status?: AttachmentChipStatus
  progress?: number
  error?: string
  nested?: {
    fieldKey: string
    groupIndex: number
    listKey: "asset_ids" | "audio_asset_ids"
    assetId: number
  }
}

export function DirectorComposerAttachments({ capability, attachments, onAdd, onRemove }: { capability: DirectorOperationCapability; attachments: DirectorComposerAttachment[]; missingRoles?: DirectorAttachmentRole[]; onAdd?: (role: DirectorAttachmentRole) => void; onRemove: (attachment: DirectorComposerAttachment) => void }) {
  if (!capability.inputs.length && !attachments.length) return null
  const direct = attachments.filter(({ nested }) => !nested)
  const nested = attachments.filter(({ nested }) => nested)
  return <div className="director-reference-slots" aria-label="Generation inputs">
    {capability.inputs.map((slot) => {
      const assigned = direct.filter(({ role }) => role === slot.role)
      return <section className="director-reference-slot" key={slot.role} data-required={slot.required ? "true" : "false"}>
        <header><span>{slot.label}</span><small>{slot.required ? "Required" : `Optional · up to ${slot.max}`}</small></header>
        <div>
          {assigned.map((attachment) => <AttachmentChip
            key={attachment.id} name={attachment.name} role={attachment.roleLabel || attachmentRoleLabel(capability, attachment.role)}
            kind={attachment.kind} previewUrl={attachment.previewUrl} posterUrl={attachment.posterUrl}
            durationLabel={attachment.durationLabel} status={attachment.status} progress={attachment.progress}
            error={attachment.error} onRemove={() => onRemove(attachment)}
          />)}
          {assigned.length < slot.max && <Button type="button" variant="outline" size="sm" className="director-attachment-slot" onClick={() => onAdd?.(slot.role)}><Plus />{assigned.length ? `Add ${slot.label.toLowerCase()}` : slot.label}</Button>}
        </div>
      </section>
    })}
    {nested.length > 0 && <section className="director-reference-slot"><header><span>Directed subjects</span><small>From model controls</small></header><div>{nested.map((attachment) => <AttachmentChip key={attachment.id} name={attachment.name} role={attachment.roleLabel || attachmentRoleLabel(capability, attachment.role)} kind={attachment.kind} previewUrl={attachment.previewUrl} posterUrl={attachment.posterUrl} onRemove={() => onRemove(attachment)} />)}</div></section>}
  </div>
}
