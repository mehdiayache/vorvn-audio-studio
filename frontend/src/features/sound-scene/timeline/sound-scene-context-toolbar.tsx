import { useEffect, useState } from "react"
import {
  ArrowDown, ArrowUp, Copy, Lock, MoreHorizontal, RadioTower, SlidersHorizontal, Trash2,
  Unlock, Volume2, VolumeX,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import type { SoundSceneEffect } from "@/types/domain"

type EffectsProps = {
  effects: SoundSceneEffect[]
  disabled?: boolean
  subject?: "Clip" | "Part"
  onPreview?: (effects: SoundSceneEffect[]) => void
  onCommit: (effects: SoundSceneEffect[]) => void
}

function effectId() { return crypto.randomUUID() }

export function SoundEffectsEditor({ effects, disabled, subject = "Clip", onPreview, onCommit }: EffectsProps) {
  const [draft, setDraft] = useState(effects)
  useEffect(() => setDraft(effects), [effects])
  const telephone = draft.find((effect) => effect.type === "telephone")
  const echo = draft.find((effect) => effect.type === "echo")

  function toggle(type: SoundSceneEffect["type"]) {
    const existing = draft.find((effect) => effect.type === type)
    const next = existing
      ? draft.map((effect) => effect.id === existing.id ? { ...effect, enabled: !effect.enabled } : effect)
      : [...draft, type === "telephone"
        ? { id: effectId(), type: "telephone" as const, enabled: true }
        : { id: effectId(), type: "echo" as const, enabled: true, delay_ms: 180, feedback: .28, mix: .22 }]
    setDraft(next)
    onPreview?.(next)
    onCommit(next)
  }

  function changeEcho(changes: Partial<Extract<SoundSceneEffect, { type: "echo" }>>, commit = false) {
    const next = draft.map((effect) => effect.type === "echo" ? { ...effect, ...changes } : effect)
    setDraft(next)
    if (commit) onCommit(next)
    else onPreview?.(next)
  }

  function move(effectId: string, direction: -1 | 1) {
    const index = draft.findIndex((effect) => effect.id === effectId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= draft.length) return
    const next = [...draft]
    ;[next[index], next[destination]] = [next[destination]!, next[index]!]
    setDraft(next)
    onPreview?.(next)
    onCommit(next)
  }

  const active = draft.filter((effect) => effect.enabled)
  return <div className="sound-effects-editor">
    <header><span><RadioTower /></span><div><b>{subject} effects</b><small>Non-destructive · browser and export</small></div></header>
    {active.length > 0 && <div className="sound-effect-chain" aria-label="Effect processing order">
      <span>Processing order</span>
      <ol>{active.map((effect, index) => <li key={effect.id}>
        <b>{index + 1}</b><span>{effect.type === "telephone" ? "Telephone" : "Echo"}</span>
        <OperatorIconButton type="button" label={`Move ${effect.type} earlier in the effect chain`} disabled={disabled || index === 0} onClick={() => move(effect.id, -1)}><ArrowUp /></OperatorIconButton>
        <OperatorIconButton type="button" label={`Move ${effect.type} later in the effect chain`} disabled={disabled || index === active.length - 1} onClick={() => move(effect.id, 1)}><ArrowDown /></OperatorIconButton>
      </li>)}</ol>
    </div>}
    <button type="button" aria-pressed={Boolean(telephone?.enabled)} disabled={disabled} onClick={() => toggle("telephone")}><span><b>Telephone</b><small>Focused 300–3400 Hz voice band</small></span><i /></button>
    <button type="button" aria-pressed={Boolean(echo?.enabled)} disabled={disabled} onClick={() => toggle("echo")}><span><b>Echo</b><small>Audible tail can overlap the next Part</small></span><i /></button>
    {echo?.enabled && <div className="sound-echo-controls">
      <label><span>Delay <b>{echo.delay_ms} ms</b></span><Slider aria-label="Echo delay" value={[echo.delay_ms]} min={50} max={1000} step={10} onValueChange={([value = 180]) => changeEcho({ delay_ms: value })} onValueCommit={([value = 180]) => changeEcho({ delay_ms: value }, true)} /></label>
      <label><span>Feedback <b>{Math.round(echo.feedback * 100)}%</b></span><Slider aria-label="Echo feedback" value={[Math.round(echo.feedback * 100)]} min={0} max={85} step={1} onValueChange={([value = 28]) => changeEcho({ feedback: value / 100 })} onValueCommit={([value = 28]) => changeEcho({ feedback: value / 100 }, true)} /></label>
      <label><span>Mix <b>{Math.round(echo.mix * 100)}%</b></span><Slider aria-label="Echo mix" value={[Math.round(echo.mix * 100)]} min={0} max={100} step={1} onValueChange={([value = 22]) => changeEcho({ mix: value / 100 })} onValueCommit={([value = 22]) => changeEcho({ mix: value / 100 }, true)} /></label>
    </div>}
  </div>
}

export type SoundContext = {
  kind: "music" | "sequence" | "silence"
  label: string
  muted: boolean
  gain: number
  effects: SoundSceneEffect[]
  lockState?: "unlocked" | "locked" | "mixed"
  count?: number
}

export function SoundSceneContextToolbar({ context, saving, onMute, onGain, onEffectsPreview, onEffects, onLock, onDuplicate, onDelete, onOptions, onOpenSequence }: {
  context: SoundContext | null
  saving: boolean
  onMute: () => void
  onGain: (gain: number) => void
  onEffectsPreview?: (effects: SoundSceneEffect[]) => void
  onEffects: (effects: SoundSceneEffect[]) => void
  onLock?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onOptions?: () => void
  onOpenSequence?: () => void
}) {
  const [gain, setGain] = useState(Math.round((context?.gain ?? 1) * 100))
  useEffect(() => setGain(Math.round((context?.gain ?? 1) * 100)), [context?.gain, context?.label])
  if (!context) return null
  const lockState = context.lockState || "unlocked"
  const hasLockedClips = lockState !== "unlocked"
  const activeEffectCount = context.effects.filter((effect) => effect.enabled).length
  const muteLabel = context.kind === "sequence"
    ? context.muted ? "Unmute Part audio" : "Mute Part audio"
    : context.muted ? "Unmute Music clip" : "Mute Music clip"
  const muteDetail = context.kind === "sequence"
    ? "Keeps this Part in the Sequence with the same position and duration."
    : "Keeps this Music placement and timing, but removes its sound from the mix."
  return <div className="sound-scene-context" aria-label={`${context.label} actions`}>
    <div className="sound-context-group is-identity"><span className="sound-context-label"><b>{context.label}</b>{context.count && context.count > 1 ? <small>{context.count} clips</small> : <small>{context.kind === "music" ? "Music clip" : context.kind === "silence" ? "Sequence pause" : "Sequence Part"}</small>}</span></div>
    {context.kind !== "silence" && <div className="sound-context-group is-mix">
      <OperatorTooltip label={muteLabel} detail={muteDetail}><Button className="sound-context-command" variant="ghost" size="sm" disabled={saving} aria-label={muteLabel} onClick={onMute}>{context.muted ? <VolumeX /> : <Volume2 />}{context.muted ? "Unmute" : "Mute"}</Button></OperatorTooltip>
      {context.kind === "sequence" && <Popover><PopoverTrigger asChild><Button className="sound-context-command" variant="ghost" size="sm" disabled={saving}><SlidersHorizontal /> Volume</Button></PopoverTrigger><PopoverContent align="end" className="sound-volume-popover"><span>Part volume <b>{gain}%</b></span><Slider aria-label="Sequence Part volume" value={[gain]} min={0} max={200} step={1} onValueChange={([value = 100]) => setGain(value)} onValueCommit={([value = 100]) => onGain(value / 100)} /></PopoverContent></Popover>}
      {(context.count === undefined || context.count === 1) ? <Popover><PopoverTrigger asChild><Button className={`sound-context-command${activeEffectCount ? " is-active" : ""}`} variant="ghost" size="sm" disabled={saving}><RadioTower /> Effects{activeEffectCount ? <small>{activeEffectCount}</small> : null}</Button></PopoverTrigger><PopoverContent align="end" className="sound-effects-popover"><SoundEffectsEditor effects={context.effects} disabled={saving} onPreview={onEffectsPreview} onCommit={onEffects} /></PopoverContent></Popover> : null}
      {onOptions && <Button className="sound-context-command" variant="ghost" size="sm" disabled={saving} onClick={onOptions}><MoreHorizontal /> Options</Button>}
    </div>}
    {context.kind === "music" && <div className="sound-context-group is-object">
      <Button className={`sound-context-command${hasLockedClips ? " is-active" : ""}`} variant="ghost" size="sm" disabled={saving} onClick={onLock}>{lockState === "locked" ? <Unlock /> : <Lock />}{lockState === "locked" ? "Unlock" : lockState === "mixed" ? "Lock all" : "Lock"}</Button>
      <Button className="sound-context-command" variant="ghost" size="sm" disabled={saving || hasLockedClips} onClick={onDuplicate} aria-label="Duplicate selected clips"><Copy /> Duplicate</Button>
      <Button className="sound-context-command danger" variant="ghost" size="sm" disabled={saving || hasLockedClips} onClick={onDelete} aria-label="Delete selected clips"><Trash2 /> Delete</Button>
    </div>}
    {(context.kind === "sequence" || context.kind === "silence") && onOpenSequence && <div className="sound-context-group is-object"><Button className="sound-context-command" variant="ghost" size="sm" disabled={saving} onClick={onOpenSequence}>Open Sequence</Button></div>}
  </div>
}
