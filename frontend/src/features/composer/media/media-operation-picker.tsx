import { AudioLines, Clapperboard, Images, MessageSquareMore, PanelsTopLeft, ScanFace, Sparkles, Type, UserRoundCog, Video, VideoIcon, WandSparkles, Wallpaper, type LucideIcon } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { MediaOperation, MediaOperationInfo } from "./media-composer-config"

const MODE_ICONS: Record<string, LucideIcon> = {
  type: Type, wallpaper: Wallpaper, panels: PanelsTopLeft, images: Images,
  audio: AudioLines, "video-forward": VideoIcon, "video-edit": Clapperboard,
  "image-edit": WandSparkles, wand: Sparkles, motion: Video,
  "user-round-cog": UserRoundCog, "message-video": MessageSquareMore,
  "audio-video": ScanFace,
}

export function operationPresentation(operation: MediaOperationInfo) {
  return {
    label: operation.presentation?.mode_label || operation.label,
    Icon: MODE_ICONS[operation.presentation?.icon || ""] || Sparkles,
  }
}

export function MediaOperationPicker({ operations, value, onValueChange }: { operations: MediaOperationInfo[]; value: MediaOperation; onValueChange: (value: MediaOperation) => void }) {
  return <ToggleGroup
    type="single"
    variant="outline"
    value={value}
    onValueChange={(next) => { if (next) onValueChange(next as MediaOperation) }}
    className="media-mode-options"
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
