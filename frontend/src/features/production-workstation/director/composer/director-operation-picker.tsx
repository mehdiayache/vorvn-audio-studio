import { AudioLines, Clapperboard, Images, MessageSquareMore, PanelsTopLeft, ScanFace, Sparkles, Type, UserRoundCog, Video, VideoIcon, WandSparkles, Wallpaper, type LucideIcon } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DirectorOperation, DirectorOperationInfo } from "./director-composer-config"

const MODE_ICONS: Record<string, LucideIcon> = {
  type: Type, wallpaper: Wallpaper, panels: PanelsTopLeft, images: Images,
  audio: AudioLines, "video-forward": VideoIcon, "video-edit": Clapperboard,
  "image-edit": WandSparkles, wand: Sparkles, motion: Video,
  "user-round-cog": UserRoundCog, "message-video": MessageSquareMore,
  "audio-video": ScanFace,
}

export function operationPresentation(operation: DirectorOperationInfo) {
  return {
    label: operation.presentation?.mode_label || operation.label,
    Icon: MODE_ICONS[operation.presentation?.icon || ""] || Sparkles,
  }
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
      const { Icon, label } = operationPresentation(operation)
      return <ToggleGroupItem
        key={operation.id}
        value={operation.id}
        aria-label={`${label}: ${operation.detail}`}
      ><Icon />{label}</ToggleGroupItem>
    })}
  </ToggleGroup>
}
