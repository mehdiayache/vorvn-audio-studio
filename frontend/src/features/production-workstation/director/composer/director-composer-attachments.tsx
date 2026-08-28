import { Plus } from "lucide-react"

import { AttachmentChip, type AttachmentChipStatus } from "@/components/ai/attachment-chip"
import { Button } from "@/components/ui/button"
import { attachmentRoleLabel, type DirectorAttachmentKind, type DirectorAttachmentRole } from "./director-composer-config"

export type DirectorComposerAttachment = {
  id: string
  name: string
  kind: DirectorAttachmentKind
  role: DirectorAttachmentRole
  previewUrl?: string | null
  posterUrl?: string | null
  durationLabel?: string | null
  file?: File
  assetId?: number
  status?: AttachmentChipStatus
  progress?: number
  error?: string
}

export function DirectorComposerAttachments({ attachments, missingRoles = [], onAdd, onRemove }: { attachments: DirectorComposerAttachment[]; missingRoles?: DirectorAttachmentRole[]; onAdd?: () => void; onRemove: (id: string) => void }) {
  if (!attachments.length && !missingRoles.length) return null
  return <div className="director-composer-attachments" aria-label="Generation references">
    {attachments.map((attachment) => <AttachmentChip
      key={attachment.id}
      name={attachment.name}
      role={attachmentRoleLabel(attachment.role)}
      kind={attachment.kind}
      previewUrl={attachment.previewUrl}
      posterUrl={attachment.posterUrl}
      durationLabel={attachment.durationLabel}
      status={attachment.status}
      progress={attachment.progress}
      error={attachment.error}
      onRemove={() => onRemove(attachment.id)}
    />)}
    {missingRoles.map((role) => <Button key={role} type="button" variant="outline" size="sm" className="director-attachment-slot" onClick={onAdd}><Plus />{attachmentRoleLabel(role)}</Button>)}
  </div>
}
