import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { ComposerContext } from "@/lib/api"
import type { WorkspaceFile } from "@/types/domain"
import type { MediaAdvancedValues } from "./media-advanced-settings"
import { MediaAdvancedSettings } from "./media-advanced-settings"
import { MediaCapabilityControls } from "./media-capability-controls"
import { MediaComposerAttachments, type MediaComposerAttachment } from "./media-composer-attachments"
import { withParameterValue, type MediaAttachmentRole, type MediaModelCapability, type MediaModelFamily, type MediaOperation, type MediaOperationCapability, type MediaOperationInfo } from "./media-composer-config"
import { MediaModelSelector } from "./media-model-selector"
import { MediaOperationPicker } from "./media-operation-picker"
import { MediaPrimaryParameters } from "./media-primary-parameters"
import { MediaSubmit } from "./media-submit"

export function MediaComposerInput({ context, prompt, operations, operation, capability, model, models, modelFamilyId, attachments, missingRoles, ratio, resolution, duration, advanced, files, busy, disabledReason, uploadStatus, canSaveReference, onPromptChange, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onRemoveAttachment, onOpenLibrary, onSwapFrames, onSaveReference, onSubmit }: {
  context: ComposerContext
  prompt: string
  operations: MediaOperationInfo[]
  operation: MediaOperation
  capability: MediaOperationCapability
  model: MediaModelCapability
  models: MediaModelFamily[]
  modelFamilyId: string
  attachments: MediaComposerAttachment[]
  missingRoles: MediaAttachmentRole[]
  ratio: string
  resolution: string
  duration: number
  advanced: MediaAdvancedValues
  files: WorkspaceFile[]
  busy: boolean
  disabledReason?: string
  uploadStatus?: string
  canSaveReference?: boolean
  onPromptChange: (value: string) => void
  onOperationChange: (value: MediaOperation) => void
  onModelChange: (value: string) => void
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
  onAdvancedChange: (value: MediaAdvancedValues) => void
  onRemoveAttachment: (attachment: MediaComposerAttachment) => void
  onOpenLibrary: (role?: MediaAttachmentRole) => void
  onSwapFrames?: () => void
  onSaveReference?: () => void
  onSubmit: () => void
}) {
  return <div className="media-composer-form" data-operation={operation}>
    <div className="media-composer-scroll">
      <section className="media-form-section media-route-section" aria-label="Creation route">
      <label className="media-form-field">
        <span>Model</span>
        <MediaModelSelector models={models} value={modelFamilyId} onValueChange={onModelChange} />
      </label>
      <div className="media-form-field">
        <span>Mode</span>
        <MediaOperationPicker operations={operations} value={operation} onValueChange={onOperationChange} />
      </div>
      </section>

      <Separator />

      <MediaComposerAttachments capability={capability} attachments={attachments} missingRoles={missingRoles} onAdd={onOpenLibrary} onRemove={onRemoveAttachment} onSwapFrames={onSwapFrames} />
      {canSaveReference && <button type="button" className="media-save-reference" onClick={onSaveReference}>Save these inputs as a reusable reference</button>}

      <label className="media-form-field media-prompt-field">
      <span>Prompt</span>
      <Textarea
        aria-label="Media prompt"
        placeholder={capability.prompt.supported ? "Describe the shot, scene, image or motion you want…" : "This mode is directed by its media inputs."}
        value={prompt}
        disabled={!capability.prompt.supported}
        rows={4}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !disabledReason && !busy) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      </label>

      <Separator />

      <section className="media-form-section media-primary-controls" aria-labelledby="media-primary-controls-title">
      <h3 id="media-primary-controls-title">Primary controls</h3>
      <MediaCapabilityControls capability={capability} parameters={advanced.parameters} ratio={ratio} resolution={resolution} duration={duration} onRatioChange={onRatioChange} onResolutionChange={onResolutionChange} onDurationChange={onDurationChange} />
      <MediaPrimaryParameters
        context={context}
        modelId={model.id}
        operation={capability.operation}
        capability={capability}
        values={advanced.parameters}
        files={files}
        onChange={(key, value) => {
          const field = capability.parameters.find((candidate) => candidate.key === key)
          if (field) onAdvancedChange({
            ...advanced,
            parameters: withParameterValue(field, advanced.parameters, value),
          })
        }}
      />
      </section>

      <Separator />

      <MediaAdvancedSettings context={context} model={model} capability={capability} values={advanced} files={files} onChange={onAdvancedChange} />
    </div>
    <footer className="media-composer-actions">
      {uploadStatus && <div className="visuals-upload-status" role="status">{uploadStatus}</div>}
      {disabledReason && !busy && <div id="media-composer-readiness" className="media-composer-readiness" role="status">{disabledReason}</div>}
      <MediaSubmit disabled={Boolean(disabledReason)} busy={busy} reason={disabledReason} onClick={onSubmit} />
    </footer>
  </div>
}
