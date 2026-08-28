import { Clipboard, Images, Plus, Upload } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { InputGroupAddon, InputGroupButton, InputGroupText } from "@/components/ui/input-group"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { VentureAsset } from "@/types/domain"
import { DirectorAdvancedSettings } from "./director-advanced-settings"
import { DirectorCapabilityControls } from "./director-capability-controls"
import type { DirectorModelCapability, DirectorOperation, DirectorOperationCapability, DirectorOperationInfo } from "./director-composer-config"
import { DirectorModelSelector } from "./director-model-selector"
import { DirectorOperationPicker } from "./director-operation-picker"
import { DirectorSubmit } from "./director-submit"

export function DirectorComposerToolbar({ operations, operation, capability, model, models, ratio, resolution, duration, advanced, assets, disabledReason, busy, uploadStatus, onOperationChange, onModelChange, onRatioChange, onResolutionChange, onDurationChange, onAdvancedChange, onUpload, onOpenLibrary, onPaste, onSubmit }: {
  operations: DirectorOperationInfo[]
  operation: DirectorOperation
  capability: DirectorOperationCapability
  model: DirectorModelCapability
  models: DirectorModelCapability[]
  ratio: string
  resolution: string
  duration: number
  advanced: DirectorAdvancedValues
  assets: VentureAsset[]
  disabledReason?: string
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
      <OperatorTooltip label="Add a reference" detail="Upload, choose from Visual Library, or paste compatible media.">
        <DropdownMenuTrigger asChild><InputGroupButton size="icon-sm" variant="outline" className="rounded-full" aria-label="Add a reference"><Plus /></InputGroupButton></DropdownMenuTrigger>
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
      <DirectorOperationPicker operations={operations} value={operation} onValueChange={onOperationChange} />
      <DirectorModelSelector models={models} value={model.id} onValueChange={onModelChange} />
      <DirectorCapabilityControls capability={capability} ratio={ratio} resolution={resolution} duration={duration} onRatioChange={onRatioChange} onResolutionChange={onResolutionChange} onDurationChange={onDurationChange} />
    </div>
    <div className="director-composer-toolbar-end">
      {uploadStatus && <InputGroupText className="director-upload-status">{uploadStatus}</InputGroupText>}
      <DirectorAdvancedSettings model={model} capability={capability} values={advanced} assets={assets} onChange={onAdvancedChange} />
      <DirectorSubmit disabled={Boolean(disabledReason)} busy={busy} reason={disabledReason} onClick={onSubmit} />
    </div>
  </InputGroupAddon>
}
