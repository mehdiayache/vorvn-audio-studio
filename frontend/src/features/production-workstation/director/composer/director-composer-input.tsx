import { useRef } from "react"

import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group"
import type { VentureAsset } from "@/types/domain"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import { DirectorComposerAttachments, type DirectorComposerAttachment } from "./director-composer-attachments"
import { DirectorComposerToolbar } from "./director-composer-toolbar"
import { withParameterValue, type DirectorAttachmentRole, type DirectorModelCapability, type DirectorModelFamily, type DirectorOperation, type DirectorOperationCapability, type DirectorOperationInfo } from "./director-composer-config"
import { DirectorPrimaryParameters } from "./director-primary-parameters"

export function DirectorComposerInput({ prompt, operations, operation, capability, model, models, modelFamilyId, attachments, missingRoles, ratio, resolution, duration, advanced, assets, busy, disabledReason, canAddReference, uploadStatus, fileAccept, onPromptChange, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onFiles, onRemoveAttachment, onOpenLibrary, onPaste, onSubmit }: {
  prompt: string
  operations: DirectorOperationInfo[]
  operation: DirectorOperation
  capability: DirectorOperationCapability
  model: DirectorModelCapability
  models: DirectorModelFamily[]
  modelFamilyId: string
  attachments: DirectorComposerAttachment[]
  missingRoles: DirectorAttachmentRole[]
  ratio: string
  resolution: string
  duration: number
  advanced: DirectorAdvancedValues
  assets: VentureAsset[]
  busy: boolean
  disabledReason?: string
  canAddReference: boolean
  uploadStatus?: string
  fileAccept: string
  onPromptChange: (value: string) => void
  onOperationChange: (value: DirectorOperation) => void
  onModelChange: (value: string) => void
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
  onAdvancedChange: (value: DirectorAdvancedValues) => void
  onFiles: (files: File[], role?: DirectorAttachmentRole) => void
  onRemoveAttachment: (attachment: DirectorComposerAttachment) => void
  onOpenLibrary: (role?: DirectorAttachmentRole) => void
  onPaste: () => void
  onSubmit: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  function receive(files: FileList | File[]) {
    const selected = Array.from(files)
    if (selected.length) onFiles(selected)
  }
  return <>
    <input ref={inputRef} hidden multiple type="file" accept={fileAccept} onChange={(event) => { if (event.target.files) receive(event.target.files); event.target.value = "" }} />
    <InputGroup
      className="director-composer-input"
      data-operation={operation}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy" } }}
      onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); receive(event.dataTransfer.files) }}
    >
      <DirectorComposerAttachments capability={capability} attachments={attachments} missingRoles={missingRoles} onAdd={onOpenLibrary} onRemove={onRemoveAttachment} />
      <InputGroupTextarea
        aria-label="Director prompt"
        placeholder={capability.prompt.supported ? "Describe the shot, scene, image or motion you want…" : "This model operation uses references without a prompt."}
        value={prompt}
        disabled={!capability.prompt.supported}
        rows={3}
        onChange={(event) => onPromptChange(event.target.value)}
        onPaste={(event) => {
          if (!event.clipboardData.files.length) return
          event.preventDefault()
          event.stopPropagation()
          receive(event.clipboardData.files)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !disabledReason && !busy) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      <DirectorPrimaryParameters
        capability={capability}
        values={advanced.parameters}
        assets={assets}
        onChange={(key, value) => {
          const field = capability.parameters.find((candidate) => candidate.key === key)
          if (field) onAdvancedChange({
            ...advanced,
            parameters: withParameterValue(field, advanced.parameters, value),
          })
        }}
      />
      {disabledReason && !busy && <div className="director-composer-readiness" role="status">{disabledReason}</div>}
      <DirectorComposerToolbar
        operations={operations}
        operation={operation}
        capability={capability}
        model={model}
        models={models}
        modelFamilyId={modelFamilyId}
        ratio={ratio}
        resolution={resolution}
        duration={duration}
        advanced={advanced}
        assets={assets}
        disabledReason={disabledReason}
        canAddReference={canAddReference}
        busy={busy}
        uploadStatus={uploadStatus}
        onOperationChange={onOperationChange}
        onModelChange={onModelChange}
        onRatioChange={onRatioChange}
        onResolutionChange={onResolutionChange}
        onDurationChange={onDurationChange}
        onAdvancedChange={onAdvancedChange}
        onUpload={() => inputRef.current?.click()}
        onOpenLibrary={onOpenLibrary}
        onPaste={onPaste}
        onSubmit={onSubmit}
      />
    </InputGroup>
  </>
}
