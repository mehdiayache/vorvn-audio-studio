import { Volume2, VolumeX } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { gainToVolumePercent } from "../sound-scene-gain"
import { AudioVolumeControl, type AudioVolumeMix } from "./audio-volume-control"

export function SelectionVolumeControl({ label, detail, gain, muted, mixed = false, disabled = false, onPreview, onCommit }: {
  label: string
  detail: string
  gain: number
  muted: boolean
  mixed?: boolean
  disabled?: boolean
  onPreview?: (mix: AudioVolumeMix) => void
  onCommit: (mix: AudioVolumeMix) => void
}) {
  const silent = muted || gain <= 0
  const value = mixed ? "Mixed" : `${silent ? 0 : gainToVolumePercent(gain)}%`
  const accessibleLabel = mixed ? `${label} · Mixed` : `${label} · ${value}`

  return <Popover>
    <OperatorTooltip label={accessibleLabel} detail={detail} disabledTrigger={disabled}>
      <PopoverTrigger asChild>
        <Button
          className={cn("selection-bar-command selection-volume-trigger", silent && "is-muted")}
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={accessibleLabel}
        >
          {silent ? <VolumeX /> : <Volume2 />}
          <span>{value}</span>
        </Button>
      </PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent align="end" className="sound-volume-popover">
      <AudioVolumeControl
        label={mixed ? "Selection volume change" : label}
        gain={mixed ? 1 : gain}
        muted={muted}
        showMute
        compact
        onPreview={onPreview}
        onCommit={onCommit}
      />
    </PopoverContent>
  </Popover>
}
