import { useRef } from "react"

import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import { DirectorComposerAttachments, type DirectorComposerAttachment } from "./director-composer-attachments"
import { DirectorComposerToolbar } from "./director-composer-toolbar"
import type { DirectorAttachmentRole, DirectorModelCapability, DirectorOperation } from "./director-composer-config"

export function DirectorComposerInput({ prompt, operation, model, models, attachments, missingRoles, ratio, resolution, duration, advanced, busy, disabledReason, uploadStatus, fileAccept, onPromptChange, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onFiles, onRemoveAttachment, onOpenLibrary, onPaste, onSubmit }: {
  prompt: string
  operation: DirectorOperation
  model: DirectorModelCapability
  models: DirectorModelCapability[]
  attachments: DirectorComposerAttachment[]
  missingRoles: DirectorAttachmentRole[]
  ratio: string
  resolution: string
  duration: number
  advanced: DirectorAdvancedValues
  busy: boolean
  disabledReason?: string
  uploadStatus?: string
  fileAccept: string
  onPromptChange: (value: string) => void
  onOperationChange: (value: DirectorOperation) => void
  onModelChange: (value: string) => void
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
  onAdvancedChange: (value: DirectorAdvancedValues) => void
  onFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onOpenLibrary: () => void
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
      <DirectorComposerAttachments attachments={attachments} missingRoles={missingRoles} onAdd={() => inputRef.current?.click()} onRemove={onRemoveAttachment} />
      <InputGroupTextarea
        aria-label="Director prompt"
        placeholder="Describe the shot, scene, image or motion you want…"
        value={prompt}
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
      <DirectorComposerToolbar
        operation={operation}
        model={model}
        models={models}
        ratio={ratio}
        resolution={resolution}
        duration={duration}
        advanced={advanced}
        disabledReason={disabledReason}
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
