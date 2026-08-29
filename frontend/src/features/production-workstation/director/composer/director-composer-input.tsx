import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { VentureAsset } from "@/types/domain"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import { DirectorAdvancedSettings } from "./director-advanced-settings"
import { DirectorCapabilityControls } from "./director-capability-controls"
import { DirectorComposerAttachments, type DirectorComposerAttachment } from "./director-composer-attachments"
import { withParameterValue, type DirectorAttachmentRole, type DirectorModelCapability, type DirectorModelFamily, type DirectorOperation, type DirectorOperationCapability, type DirectorOperationInfo } from "./director-composer-config"
import { DirectorModelSelector } from "./director-model-selector"
import { DirectorOperationPicker } from "./director-operation-picker"
import { DirectorPrimaryParameters } from "./director-primary-parameters"
import { DirectorSubmit } from "./director-submit"

export function DirectorComposerInput({ productionId, prompt, operations, operation, capability, model, models, modelFamilyId, attachments, missingRoles, ratio, resolution, duration, advanced, assets, busy, disabledReason, uploadStatus, canSaveReference, onPromptChange, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onRemoveAttachment, onOpenLibrary, onSwapFrames, onSaveReference, onSubmit }: {
  productionId: number
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
  uploadStatus?: string
  canSaveReference?: boolean
  onPromptChange: (value: string) => void
  onOperationChange: (value: DirectorOperation) => void
  onModelChange: (value: string) => void
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
  onAdvancedChange: (value: DirectorAdvancedValues) => void
  onRemoveAttachment: (attachment: DirectorComposerAttachment) => void
  onOpenLibrary: (role?: DirectorAttachmentRole) => void
  onSwapFrames?: () => void
  onSaveReference?: () => void
  onSubmit: () => void
}) {
  return <div className="director-composer-form" data-operation={operation}>
    <div className="director-composer-scroll">
      <section className="director-form-section director-route-section" aria-label="Creation route">
      <label className="director-form-field">
        <span>Model</span>
        <DirectorModelSelector models={models} value={modelFamilyId} onValueChange={onModelChange} />
      </label>
      <div className="director-form-field">
        <span>Mode</span>
        <DirectorOperationPicker operations={operations} value={operation} onValueChange={onOperationChange} />
      </div>
      </section>

      <Separator />

      <DirectorComposerAttachments capability={capability} attachments={attachments} missingRoles={missingRoles} onAdd={onOpenLibrary} onRemove={onRemoveAttachment} onSwapFrames={onSwapFrames} />
      {canSaveReference && <button type="button" className="director-save-reference" onClick={onSaveReference}>Save these inputs as a reusable reference</button>}

      <label className="director-form-field director-prompt-field">
      <span>Prompt</span>
      <Textarea
        aria-label="Director prompt"
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

      <section className="director-form-section director-primary-controls" aria-labelledby="director-primary-controls-title">
      <h3 id="director-primary-controls-title">Primary controls</h3>
      <DirectorCapabilityControls capability={capability} parameters={advanced.parameters} ratio={ratio} resolution={resolution} duration={duration} onRatioChange={onRatioChange} onResolutionChange={onResolutionChange} onDurationChange={onDurationChange} />
      <DirectorPrimaryParameters
        productionId={productionId}
        modelId={model.id}
        operation={capability.operation}
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
      </section>

      <Separator />

      <DirectorAdvancedSettings productionId={productionId} model={model} capability={capability} values={advanced} assets={assets} onChange={onAdvancedChange} />
    </div>
    <footer className="director-composer-actions">
      {uploadStatus && <div className="director-upload-status" role="status">{uploadStatus}</div>}
      {disabledReason && !busy && <div id="director-composer-readiness" className="director-composer-readiness" role="status">{disabledReason}</div>}
      <DirectorSubmit disabled={Boolean(disabledReason)} busy={busy} reason={disabledReason} onClick={onSubmit} />
    </footer>
  </div>
}
