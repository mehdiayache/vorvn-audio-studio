import { Separator } from "@/components/ui/separator"
import type { CreatorContext } from "@/lib/api"
import type { WorkspaceFile } from "@/types/domain"
import {
  CreatorCapabilityBody,
  CreatorActionBar,
  CreatorCapabilityField,
  CreatorCapabilityPanel,
  CreatorPromptField,
  CreatorCapabilityRoute,
} from "../panel/creator-capability-panel"
import type { MediaAdvancedValues } from "./media-advanced-settings"
import { MediaAdvancedSettings } from "./media-advanced-settings"
import { MediaCapabilityControls } from "./media-capability-controls"
import { MediaCreatorAttachments, type MediaCreatorAttachment } from "./media-creator-attachments"
import { withParameterValue, type MediaAttachmentRole, type MediaModelCapability, type MediaModelFamily, type MediaOperation, type MediaOperationCapability, type MediaOperationInfo } from "./media-creator-config"
import { MediaModelSelector } from "./media-model-selector"
import { MediaOperationPicker } from "./media-operation-picker"
import { MediaPrimaryParameters } from "./media-primary-parameters"
import { MediaSubmit } from "./media-submit"

export function MediaCreatorInput({ context, prompt, operations, operation, capability, model, models, modelFamilyId, attachments, missingRoles, ratio, resolution, duration, advanced, files, busy, disabledReason, uploadStatus, canSaveReference, onPromptChange, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onRemoveAttachment, onOpenLibrary, onSwapFrames, onSaveReference, onSubmit }: {
  context: CreatorContext
  prompt: string
  operations: MediaOperationInfo[]
  operation: MediaOperation
  capability: MediaOperationCapability
  model: MediaModelCapability
  models: MediaModelFamily[]
  modelFamilyId: string
  attachments: MediaCreatorAttachment[]
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
  onRemoveAttachment: (attachment: MediaCreatorAttachment) => void
  onOpenLibrary: (role?: MediaAttachmentRole) => void
  onSwapFrames?: () => void
  onSaveReference?: () => void
  onSubmit: () => void
}) {
  return <CreatorCapabilityPanel className="media-creator-form" data-operation={operation}>
    <CreatorCapabilityBody className="media-creator-scroll">
      <CreatorCapabilityRoute className="media-form-section media-route-section">
      <CreatorCapabilityField label="Model" className="media-form-field">
        <MediaModelSelector models={models} value={modelFamilyId} onValueChange={onModelChange} />
      </CreatorCapabilityField>
      <CreatorCapabilityField label="Mode" className="media-form-field">
        <MediaOperationPicker operations={operations} value={operation} onValueChange={onOperationChange} />
      </CreatorCapabilityField>
      </CreatorCapabilityRoute>

      <Separator />

      <MediaCreatorAttachments capability={capability} attachments={attachments} missingRoles={missingRoles} onAdd={onOpenLibrary} onRemove={onRemoveAttachment} onSwapFrames={onSwapFrames} />
      {canSaveReference && <button type="button" className="media-save-reference" onClick={onSaveReference}>Save these inputs as a reusable reference</button>}

      <CreatorPromptField
        ariaLabel="Media prompt"
        className="media-form-field media-prompt-field"
        placeholder={capability.prompt.supported ? "Describe the shot, scene, image or motion you want…" : "This mode is directed by its media inputs."}
        value={prompt}
        disabled={!capability.prompt.supported}
        rows={4}
        onChange={onPromptChange}
        onSubmit={!disabledReason && !busy ? onSubmit : undefined}
      />

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
    </CreatorCapabilityBody>
    <CreatorActionBar
      className="media-creator-actions"
      status={<>{uploadStatus && <span>{uploadStatus}</span>}{disabledReason && !busy && <span id="media-creator-readiness">{disabledReason}</span>}</>}
      actions={<MediaSubmit disabled={Boolean(disabledReason)} busy={busy} reason={disabledReason} onClick={onSubmit} />}
    />
  </CreatorCapabilityPanel>
}
