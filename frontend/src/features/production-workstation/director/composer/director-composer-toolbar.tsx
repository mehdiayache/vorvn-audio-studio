import { Clipboard, Images, Plus, Upload } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroupAddon, InputGroupButton, InputGroupText } from "@/components/ui/input-group"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { VentureAsset } from "@/types/domain"
import { DirectorAdvancedSettings } from "./director-advanced-settings"
import { DirectorCapabilityControls } from "./director-capability-controls"
import type { DirectorModelCapability, DirectorModelFamily, DirectorOperation, DirectorOperationCapability, DirectorOperationInfo } from "./director-composer-config"
import { DirectorModelSelector } from "./director-model-selector"
import { DirectorOperationPicker } from "./director-operation-picker"
import { DirectorSubmit } from "./director-submit"

export function DirectorComposerToolbar({ operations, operation, capability, model, models, modelFamilyId, ratio, resolution, duration, advanced, assets, disabledReason, canAddReference, busy, uploadStatus, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onUpload, onOpenLibrary, onPaste, onSubmit }: {
  operations: DirectorOperationInfo[]
  operation: DirectorOperation
  capability: DirectorOperationCapability
  model: DirectorModelCapability
  models: DirectorModelFamily[]
  modelFamilyId: string
  ratio: string
  resolution: string
  duration: number
  advanced: DirectorAdvancedValues
  assets: VentureAsset[]
  disabledReason?: string
  canAddReference: boolean
  busy: boolean
  uploadStatus?: string
  onOperationChange: (value: DirectorOperation) => void
  onModelChange: (value: string) => void
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
  onAdvancedChange: (value: DirectorAdvancedValues) => void
  onUpload: () => void
  onOpenLibrary: () => void
  onPaste: () => void
  onSubmit: () => void
}) {
  return <InputGroupAddon align="block-end" className="director-composer-toolbar">
    <DropdownMenu>
      <OperatorTooltip label="Add a reference" detail={canAddReference ? "Upload, choose from Visual Library, or paste media accepted by this creation type." : "This creation type has no open reference position. Choose another type or add a subject in model settings."}>
        <DropdownMenuTrigger asChild><InputGroupButton disabled={!canAddReference} size="icon-sm" variant="outline" className="rounded-full" aria-label="Add a reference"><Plus /></InputGroupButton></DropdownMenuTrigger>
      </OperatorTooltip>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>Add reference</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onUpload}><Upload />Upload from computer</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenLibrary}><Images />Choose from Visual Library</DropdownMenuItem>
          <DropdownMenuItem onSelect={onPaste}><Clipboard />Paste from clipboard</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <div className="director-composer-toolbar-main">
      <DirectorModelSelector models={models} value={modelFamilyId} onValueChange={onModelChange} />
      <DirectorOperationPicker operations={operations} value={operation} onValueChange={onOperationChange} />
      <DirectorCapabilityControls capability={capability} parameters={advanced.parameters} ratio={ratio} resolution={resolution} duration={duration} onRatioChange={onRatioChange} onResolutionChange={onResolutionChange} onDurationChange={onDurationChange} />
    </div>
    <div className="director-composer-toolbar-end">
      {uploadStatus && <InputGroupText className="director-upload-status">{uploadStatus}</InputGroupText>}
      <DirectorAdvancedSettings model={model} capability={capability} values={advanced} assets={assets} onChange={onAdvancedChange} />
      <DirectorSubmit disabled={Boolean(disabledReason)} busy={busy} reason={disabledReason} onClick={onSubmit} />
    </div>
  </InputGroupAddon>
}
