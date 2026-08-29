import { Images, PanelsTopLeft, Type, Wallpaper } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DirectorOperation, DirectorOperationInfo } from "./director-composer-config"

function modeLabel(operation: DirectorOperationInfo) {
  const id = operation.id.replaceAll("-", "_").toLowerCase()
  if (id.includes("reference")) return "References"
  if (id.includes("frame")) return "Frames"
  if (id.includes("image")) return "Image"
  if (id.includes("text") || id.includes("video")) return "Text"
  return operation.label
}

function modeIcon(operation: DirectorOperationInfo) {
  const label = modeLabel(operation)
  if (label === "References") return Images
  if (label === "Frames") return PanelsTopLeft
  if (label === "Image") return Wallpaper
  return Type
}

export function DirectorOperationPicker({ operations, value, onValueChange }: { operations: DirectorOperationInfo[]; value: DirectorOperation; onValueChange: (value: DirectorOperation) => void }) {
  return <ToggleGroup
    type="single"
    variant="outline"
    value={value}
    onValueChange={(next) => { if (next) onValueChange(next as DirectorOperation) }}
    className="director-mode-options"
    aria-label="Creation mode"
  >
    {operations.map((operation) => {
      const Icon = modeIcon(operation)
      return <ToggleGroupItem
        key={operation.id}
        value={operation.id}
        aria-label={`${modeLabel(operation)}: ${operation.detail}`}
      ><Icon />{modeLabel(operation)}</ToggleGroupItem>
    })}
  </ToggleGroup>
}
