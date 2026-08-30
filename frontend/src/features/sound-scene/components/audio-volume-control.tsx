import { RotateCcw, Volume2, VolumeX } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  DEFAULT_VOLUME_PERCENT,
  gainToVolumePercent,
  MAX_VOLUME_PERCENT,
  volumePercentToGain,
} from "../sound-scene-gain"

import "./audio-volume-control.css"

export type AudioVolumeMix = { gain: number; muted: boolean }

export function AudioVolumeControl({ label, gain, muted, disabled = false, showMute = true, compact = false, onPreview, onCommit }: {
  label: string
  gain: number
  muted: boolean
  disabled?: boolean
  showMute?: boolean
  compact?: boolean
  onPreview?: (mix: AudioVolumeMix) => void
  onCommit: (mix: AudioVolumeMix) => void | Promise<void>
}) {
  const effectiveMuted = muted || gain <= 0
  const rememberedGain = useRef(gain > 0 ? gain : 1)
  const [percent, setPercent] = useState(effectiveMuted ? 0 : gainToVolumePercent(gain))

  useEffect(() => {
    if (gain > 0) rememberedGain.current = gain
    setPercent(muted || gain <= 0 ? 0 : gainToVolumePercent(gain))
  }, [gain, muted])

  function mixFor(nextPercent: number): AudioVolumeMix {
    if (nextPercent <= 0) return { gain: gain > 0 ? gain : rememberedGain.current || 1, muted: true }
    const nextGain = volumePercentToGain(nextPercent)
    rememberedGain.current = nextGain
    return { gain: nextGain, muted: false }
  }

  function preview(nextPercent: number) {
    setPercent(nextPercent)
    onPreview?.(mixFor(nextPercent))
  }

  function commit(nextPercent: number) {
    setPercent(nextPercent)
    void onCommit(mixFor(nextPercent))
  }

  function toggleMute() {
    const next = effectiveMuted
      ? { gain: rememberedGain.current || 1, muted: false }
      : { gain: gain > 0 ? gain : rememberedGain.current || 1, muted: true }
    setPercent(next.muted ? 0 : gainToVolumePercent(next.gain))
    onPreview?.(next)
    void onCommit(next)
  }

  function reset() {
    const next = { gain: 1, muted: false }
    rememberedGain.current = 1
    setPercent(DEFAULT_VOLUME_PERCENT)
    onPreview?.(next)
    void onCommit(next)
  }

  return <div className={cn("audio-volume-control", compact && "is-compact", effectiveMuted && "is-muted")}>
    <div className="audio-volume-heading">
      <span>{label}</span>
      <strong>{percent}%</strong>
      {(effectiveMuted || gainToVolumePercent(gain) !== DEFAULT_VOLUME_PERCENT) && <OperatorIconButton label={`Reset ${label} to 100%`} detail="Restore the source level and unmute it." size="icon-sm" disabled={disabled} onClick={reset}><RotateCcw /></OperatorIconButton>}
    </div>
    <div className="audio-volume-row">
      {showMute && <OperatorIconButton label={effectiveMuted ? `Unmute ${label}` : `Mute ${label}`} detail={effectiveMuted ? "Restore the last non-zero volume." : "Silence this audio without forgetting its volume."} className={cn("audio-volume-mute", effectiveMuted && "is-active")} size="icon-sm" disabled={disabled} aria-pressed={effectiveMuted} onClick={toggleMute}>{effectiveMuted ? <VolumeX /> : <Volume2 />}</OperatorIconButton>}
      <div className="audio-volume-slider">
        <Slider
          aria-label={label}
          disabled={disabled}
          min={0}
          max={MAX_VOLUME_PERCENT}
          step={1}
          value={[percent]}
          onValueChange={([value = percent]) => preview(value)}
          onValueCommit={([value = percent]) => commit(value)}
        />
        <i aria-hidden="true" />
      </div>
    </div>
  </div>
}
