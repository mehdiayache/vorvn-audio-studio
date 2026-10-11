import type {InspectorLocale} from "./studio-inspector-copy"
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
} from "./studio-gain"

import "./audio-volume-control.css"

export type AudioVolumeMix = { gain: number; muted: boolean }
const volumeCopy={
 en:{reset:(label:string)=>`Reset ${label} to 100%`,mute:(label:string)=>`Mute ${label}`,unmute:(label:string)=>`Unmute ${label}`,restore:"Restore the source level and unmute it.",remember:"Restore the last non-zero volume.",silence:"Silence this audio without forgetting its volume."},
 fr:{reset:(label:string)=>`Réinitialiser ${label} à 100 %`,mute:(label:string)=>`Couper ${label}`,unmute:(label:string)=>`Rétablir ${label}`,restore:"Rétablit le niveau de la source et active le son.",remember:"Rétablit le dernier volume non nul.",silence:"Coupe cet audio en conservant son volume."},
 ar:{reset:(label:string)=>`إعادة ضبط ${label} إلى ١٠٠٪`,mute:(label:string)=>`كتم ${label}`,unmute:(label:string)=>`إلغاء كتم ${label}`,restore:"استعد مستوى المصدر وألغِ كتمه.",remember:"استعد آخر مستوى صوت غير صفري.",silence:"اكتم الصوت مع الاحتفاظ بمستواه."},
 id:{reset:(label:string)=>`Reset ${label} ke 100%`,mute:(label:string)=>`Bisukan ${label}`,unmute:(label:string)=>`Aktifkan ${label}`,restore:"Pulihkan volume sumber dan aktifkan suaranya.",remember:"Pulihkan volume terakhir yang bukan nol.",silence:"Bisukan audio ini tanpa melupakan volumenya."},
}


export function AudioVolumeControl({ label, gain, muted, disabled = false, showMute = true, compact = false, locale = "en", onPreview, onCommit }: {
  locale?: InspectorLocale
  label: string
  gain: number
  muted: boolean
  disabled?: boolean
  showMute?: boolean
  compact?: boolean
  onPreview?: (mix: AudioVolumeMix) => void
  onCommit: (mix: AudioVolumeMix) => void | Promise<void>
}) {
  const copy=volumeCopy[locale]
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
      {(effectiveMuted || gainToVolumePercent(gain) !== DEFAULT_VOLUME_PERCENT) && <OperatorIconButton label={copy.reset(label)} detail={copy.restore} size="icon-sm" disabled={disabled} onClick={reset}><RotateCcw /></OperatorIconButton>}
    </div>
    <div className="audio-volume-row">
      {showMute && <OperatorIconButton label={effectiveMuted ? copy.unmute(label) : copy.mute(label)} detail={effectiveMuted ? copy.remember : copy.silence} className={cn("audio-volume-mute", effectiveMuted && "is-active")} size="icon-sm" disabled={disabled} aria-pressed={effectiveMuted} onClick={toggleMute}>{effectiveMuted ? <VolumeX /> : <Volume2 />}</OperatorIconButton>}
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
