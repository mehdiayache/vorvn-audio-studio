import { RadioTower, VolumeX } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { SoundMediaIcon } from "@/features/sound-scene/sound-media-icon"
import { gainToDb, gainToVolumePercent } from "@/features/sound-scene/sound-scene-gain"
import { audioUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SequenceMixOverride, SequenceProjectionSpan } from "@/types/domain"
import { TimelineCanvasWaveform } from "./timeline-canvas-waveform"

type MixGesture = {
  mode: "gain" | "fade-in" | "fade-out"
  pointerId: number
  originX: number
  originY: number
  initial: SequenceMixOverride
  latest: Partial<SequenceMixOverride>
  changed: boolean
}

export function SequenceTimelineClip({ span, selected, saving, pixelsPerSecond, style, onSelect, onPreview, onCommit }: {
  span: SequenceProjectionSpan
  selected: boolean
  saving: boolean
  pixelsPerSecond: number
  style: CSSProperties
  onSelect: () => void
  onPreview: (changes: Partial<SequenceMixOverride>) => void
  onCommit: (changes: Partial<SequenceMixOverride>) => void
}) {
  const [mix, setMix] = useState(span.mix)
  const gesture = useRef<MixGesture | null>(null)
  useEffect(() => setMix(span.mix), [span.mix, span.part_public_id])

  const duration = Math.max(.001, span.duration_ms / 1_000)
  const fadeIn = Math.min(duration, mix.fade_in_ms / 1_000)
  const fadeOut = Math.min(duration, mix.fade_out_ms / 1_000)
  const gainPosition = Math.max(9, Math.min(89, 54 - gainToDb(mix.gain) * 1.36))
  const silent = mix.muted || mix.gain <= 0
  const activeEffects = mix.effects.filter((effect) => effect.enabled).length
  const partNumber = String(Number(span.position ?? 0) + 1).padStart(2, "0")
  const label = span.role || span.voice_name || span.title || "Speech"

  function begin(event: ReactPointerEvent<HTMLElement>, mode: MixGesture["mode"]) {
    if (saving || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    gesture.current = {
      mode,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      initial: mix,
      latest: {},
      changed: false,
    }
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.originX
    const dy = event.clientY - active.originY
    if (!active.changed && Math.hypot(dx, dy) < 4) return
    active.changed = true
    let changes: Partial<SequenceMixOverride>
    if (active.mode === "gain") {
      const initialDb = active.initial.gain <= .001 ? -60 : gainToDb(active.initial.gain)
      const gain = Math.min(2, Math.max(0, 10 ** (Math.max(-60, Math.min(6, initialDb - dy * .25)) / 20)))
      changes = { gain, muted: gain <= 0 }
    } else {
      const original = active.mode === "fade-in" ? active.initial.fade_in_ms : active.initial.fade_out_ms
      const milliseconds = Math.max(0, Math.min(
        span.duration_ms,
        original + (active.mode === "fade-in" ? dx : -dx) / pixelsPerSecond * 1_000,
      ))
      changes = { [active.mode === "fade-in" ? "fade_in_ms" : "fade_out_ms"]: Math.round(milliseconds) }
    }
    active.latest = changes
    setMix((current) => ({ ...current, ...changes }))
    onPreview(changes)
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    if (active.changed) onCommit(active.latest)
  }

  function cancel(event: ReactPointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    gesture.current = null
    setMix(active.initial)
    onPreview(active.initial)
  }

  return <div
    data-timeline-shortcut-surface="true"
    className={cn("sound-sequence-clip is-speech", selected && "is-selected")}
    style={style}
    onClick={onSelect}
    onPointerMove={move}
    onPointerUp={finish}
    onPointerCancel={cancel}
  >
    <TimelineCanvasWaveform url={span.filename ? audioUrl(span.filename) : undefined} />
    <button type="button" className="sound-sequence-select-surface" aria-label={`Speech Part ${partNumber} · ${label} · ${silent ? 0 : gainToVolumePercent(mix.gain)}%`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelect() }} />
    <span className="sound-sequence-label"><SoundMediaIcon kind="speech" /><em>{partNumber}</em><span><b>{label}</b><small>{silent ? "0%" : `${gainToVolumePercent(mix.gain)}%`}</small></span></span>
    {(mix.muted || activeEffects > 0) && <span className="sound-clip-states">{mix.muted && <i title="Muted"><VolumeX /></i>}{activeEffects > 0 && <i title={`${activeEffects} active effect${activeEffects === 1 ? "" : "s"}`}><RadioTower /><b>{activeEffects}</b></i>}</span>}
    {(selected || fadeIn > 0 || fadeOut > 0) && <svg className="sound-fade-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M 0 100 L ${fadeIn / duration * 100} 0 L ${100 - fadeOut / duration * 100} 0 L 100 100`} /></svg>}
    {selected && <>
      <OperatorTooltip label="Adjust Speech volume" detail="Drag vertically. This changes Timeline playback and export, not Script timing."><div className="sound-gain-line" style={{ top: `${gainPosition}%` }} onPointerDown={(event) => begin(event, "gain")}><i /></div></OperatorTooltip>
      <OperatorTooltip label="Adjust Speech fade in" detail="Drag horizontally to shape how this Part enters."><button className="sound-fade-handle is-in" style={{ left: `${fadeIn / duration * 100}%` }} aria-label="Speech fade in" onPointerDown={(event) => begin(event, "fade-in")} /></OperatorTooltip>
      <OperatorTooltip label="Adjust Speech fade out" detail="Drag horizontally to shape how this Part leaves."><button className="sound-fade-handle is-out" style={{ left: `${(1 - fadeOut / duration) * 100}%` }} aria-label="Speech fade out" onPointerDown={(event) => begin(event, "fade-out")} /></OperatorTooltip>
    </>}
  </div>
}
