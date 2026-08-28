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

export function DirectorComposerAttachments({ capability, attachments, missingRoles = [], onAdd, onRemove }: { capability: DirectorOperationCapability; attachments: DirectorComposerAttachment[]; missingRoles?: DirectorAttachmentRole[]; onAdd?: () => void; onRemove: (attachment: DirectorComposerAttachment) => void }) {
  if (!attachments.length && !missingRoles.length) return null
  return <div className="director-composer-attachments" aria-label="Generation references">
    {attachments.map((attachment) => <AttachmentChip
      key={attachment.id}
      name={attachment.name}
      role={attachment.roleLabel || attachmentRoleLabel(capability, attachment.role)}
      kind={attachment.kind}
      previewUrl={attachment.previewUrl}
      posterUrl={attachment.posterUrl}
      durationLabel={attachment.durationLabel}
      status={attachment.status}
      progress={attachment.progress}
      error={attachment.error}
      onRemove={() => onRemove(attachment)}
    />)}
    {missingRoles.map((role) => <Button key={role} type="button" variant="outline" size="sm" className="director-attachment-slot" onClick={onAdd}><Plus />{attachmentRoleLabel(capability, role)}</Button>)}
  </div>
}
