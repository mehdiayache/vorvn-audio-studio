import { useEffect, useState } from "react"
import {
  ArrowDown, ArrowUp, Blend, Check, Copy, Gauge, Lock, MoreHorizontal, MoveHorizontal, Pause, Phone,
  Play, RadioTower, Repeat2, Scissors, SlidersHorizontal, Trash2, Unlock,
  Waves, Zap, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { SelectionBar } from "@/components/selection-bar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import type { SoundSceneEffect } from "@/types/domain"
import { SOUND_MEDIA_LABELS, SoundMediaIcon, type SoundMediaKind } from "../sound-media-icon"
import type { AudioVolumeMix } from "../components/audio-volume-control"
import { SelectionVolumeControl } from "../components/selection-volume-control"

type EffectsProps = {
  effects: SoundSceneEffect[]
  disabled?: boolean
  subject?: "Clip" | "Part"
  onPreview?: (effects: SoundSceneEffect[]) => void
  onCommit: (effects: SoundSceneEffect[]) => void
}

function effectId() { return crypto.randomUUID() }

const EFFECT_LABELS: Record<SoundSceneEffect["type"], string> = {
  telephone: "Telephone", echo: "Echo", filter: "Filter", compressor: "Compressor",
  reverb: "Reverb", distortion: "Distortion", pan: "Stereo Pan",
}

const EFFECT_ICONS: Record<SoundSceneEffect["type"], LucideIcon> = {
  telephone: Phone,
  echo: Repeat2,
  filter: SlidersHorizontal,
  compressor: Gauge,
  reverb: Waves,
  distortion: Zap,
  pan: MoveHorizontal,
}

function newEffect(type: SoundSceneEffect["type"]): SoundSceneEffect {
  const shared = { id: effectId(), enabled: true }
  if (type === "telephone") return { ...shared, type }
  if (type === "echo") return { ...shared, type, delay_ms: 180, feedback: .28, mix: .22 }
  if (type === "filter") return { ...shared, type, mode: "lowpass", frequency_hz: 3_400, q: .707 }
  if (type === "compressor") return { ...shared, type, threshold_db: -18, ratio: 4, attack_ms: 12, release_ms: 180, makeup_db: 0 }
  if (type === "reverb") return { ...shared, type, room_size: .45, mix: .2 }
  if (type === "distortion") return { ...shared, type, amount: .2, mix: .25 }
  return { ...shared, type: "pan", pan: 0 }
}

function presetEffects(preset: string): SoundSceneEffect[] {
  const effect = <T extends SoundSceneEffect["type"]>(type: T, changes: object = {}) =>
    ({ ...newEffect(type), ...changes } as Extract<SoundSceneEffect, { type: T }>)
  if (preset === "telephone") return [effect("telephone")]
  if (preset === "radio") return [effect("telephone"), effect("compressor", { threshold_db: -20, ratio: 5 }), effect("distortion", { amount: .12, mix: .12 })]
  if (preset === "walkie") return [effect("telephone"), effect("compressor", { threshold_db: -24, ratio: 7 }), effect("distortion", { amount: .32, mix: .28 })]
  if (preset === "intercom") return [effect("telephone"), effect("compressor", { threshold_db: -22, ratio: 5 }), effect("reverb", { room_size: .18, mix: .12 })]
  if (preset === "behind-door") return [effect("filter", { mode: "lowpass", frequency_hz: 1_100 }), effect("reverb", { room_size: .32, mix: .18 })]
  if (preset === "next-room") return [effect("filter", { mode: "lowpass", frequency_hz: 1_800 }), effect("reverb", { room_size: .48, mix: .25 })]
  if (preset === "small-room") return [effect("reverb", { room_size: .25, mix: .18 })]
  if (preset === "large-hall") return [effect("reverb", { room_size: .78, mix: .38 })]
  if (preset === "cave") return [effect("reverb", { room_size: 1, mix: .48 }), effect("echo", { delay_ms: 420, feedback: .34, mix: .16 })]
  if (preset === "old-speaker") return [effect("filter", { mode: "highpass", frequency_hz: 180 }), effect("distortion", { amount: .38, mix: .34 })]
  if (preset === "robot") return [effect("filter", { mode: "highpass", frequency_hz: 260, q: 2.4 }), effect("distortion", { amount: .52, mix: .48 }), effect("echo", { delay_ms: 90, feedback: .18, mix: .18 })]
  return []
}

export function SoundEffectsEditor({ effects, disabled, subject = "Clip", onPreview, onCommit }: EffectsProps) {
  const [draft, setDraft] = useState(effects)
  const [preset, setPreset] = useState("")
  const [focusedType, setFocusedType] = useState<SoundSceneEffect["type"] | null>(
    effects.find((effect) => effect.enabled)?.type || null,
  )
  useEffect(() => {
    setDraft(effects)
    setPreset("")
    setFocusedType((current) => effects.some((effect) =>
      effect.type === current && effect.enabled)
      ? current : effects.find((effect) => effect.enabled)?.type || null)
  }, [effects])

  function toggle(type: SoundSceneEffect["type"]) {
    const existing = draft.find((effect) => effect.type === type)
    const next = existing
      ? draft.map((effect) => effect.id === existing.id ? { ...effect, enabled: !effect.enabled } : effect)
      : [...draft, newEffect(type)]
    setDraft(next)
    setPreset("")
    setFocusedType(type)
    onPreview?.(next)
    onCommit(next)
  }

  function change(type: SoundSceneEffect["type"], changes: object, commit = false) {
    const next = draft.map((effect) => effect.type === type ? { ...effect, ...changes } as SoundSceneEffect : effect)
    setDraft(next)
    setPreset("")
    if (commit) onCommit(next)
    else onPreview?.(next)
  }

  function applyPreset(preset: string) {
    const next = presetEffects(preset)
    setDraft(next)
    setPreset(preset)
    setFocusedType(next[0]?.type || null)
    onPreview?.(next)
    onCommit(next)
  }

  function move(effectId: string, direction: -1 | 1) {
    const index = draft.findIndex((effect) => effect.id === effectId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= draft.length) return
    const next = [...draft]
    ;[next[index], next[destination]] = [next[destination]!, next[index]!]
    setDraft(next)
    setPreset("")
    onPreview?.(next)
    onCommit(next)
  }

  const active = draft.filter((effect) => effect.enabled)
  const focused = draft.find((effect) => effect.type === focusedType && effect.enabled) || null
  const effectTypes = Object.keys(EFFECT_LABELS) as SoundSceneEffect["type"][]
  return <OperatorInspectorSection
    icon={RadioTower}
    title={`${subject} effects`}
    meta={active.length ? `${active.length} active` : "None active"}
    metaTechnical
    help="This non-destructive chain is used by browser playback and final export."
    className="sound-effects-editor"
  >
    <Select value={preset} onValueChange={applyPreset} disabled={disabled}><SelectTrigger className="sound-effect-preset"><SelectValue placeholder="Apply a creative preset…" /></SelectTrigger><SelectContent>
      <SelectItem value="telephone">Telephone</SelectItem><SelectItem value="radio">Radio</SelectItem><SelectItem value="walkie">Walkie-talkie</SelectItem><SelectItem value="intercom">Intercom</SelectItem>
      <SelectItem value="behind-door">Behind a door</SelectItem><SelectItem value="next-room">Next room</SelectItem><SelectItem value="small-room">Small room</SelectItem><SelectItem value="large-hall">Large hall</SelectItem><SelectItem value="cave">Cave</SelectItem><SelectItem value="old-speaker">Old speaker</SelectItem><SelectItem value="robot">Robot</SelectItem>
    </SelectContent></Select>
    <div className="sound-effect-palette" aria-label="Effect primitives">{effectTypes.map((type) => {
      const enabled = Boolean(draft.find((effect) => effect.type === type)?.enabled)
      const EffectIcon = EFFECT_ICONS[type]
      return <button key={type} type="button" aria-label={`${EFFECT_LABELS[type]} effect · ${enabled ? "Active" : "Inactive"}`} aria-pressed={enabled} disabled={disabled} onClick={() => toggle(type)} onFocus={() => setFocusedType(type)}><EffectIcon /><span>{EFFECT_LABELS[type]}</span>{enabled && <Check className="sound-effect-active-check" />}</button>
    })}</div>
    {active.length > 0 && <div className="sound-effect-chain" aria-label="Effect processing order">
      <span>Processing order</span>
      <ol>{active.map((effect, index) => <li key={effect.id}>
        <b>{index + 1}</b><button type="button" onClick={() => setFocusedType(effect.type)}>{EFFECT_LABELS[effect.type]}</button>
        <OperatorIconButton type="button" label={`Move ${effect.type} earlier in the effect chain`} disabled={disabled || index === 0} onClick={() => move(effect.id, -1)}><ArrowUp /></OperatorIconButton>
        <OperatorIconButton type="button" label={`Move ${effect.type} later in the effect chain`} disabled={disabled || index === active.length - 1} onClick={() => move(effect.id, 1)}><ArrowDown /></OperatorIconButton>
      </li>)}</ol>
    </div>}
    {focused && <div className="sound-effect-controls"><strong>{EFFECT_LABELS[focused.type]}</strong>
      {focused.type === "telephone" && <p>Focused 300–3400 Hz voice band. Use a preset when you also want compression, room or texture.</p>}
      {focused.type === "filter" && <><div className="sound-filter-mode"><button type="button" aria-pressed={focused.mode === "lowpass"} onClick={() => change("filter", { mode: "lowpass" }, true)}>Low-pass</button><button type="button" aria-pressed={focused.mode === "highpass"} onClick={() => change("filter", { mode: "highpass" }, true)}>High-pass</button></div><EffectSlider label="Cutoff" value={focused.frequency_hz} min={40} max={20_000} step={10} format={(value) => value >= 1_000 ? `${(value / 1_000).toFixed(1)} kHz` : `${value} Hz`} onPreview={(value) => change("filter", { frequency_hz: value })} onCommit={(value) => change("filter", { frequency_hz: value }, true)} /><EffectSlider label="Resonance" value={focused.q} min={.1} max={18} step={.1} format={(value) => value.toFixed(1)} onPreview={(value) => change("filter", { q: value })} onCommit={(value) => change("filter", { q: value }, true)} /></>}
      {focused.type === "compressor" && <><EffectSlider label="Threshold" value={focused.threshold_db} min={-60} max={0} step={1} format={(value) => `${value} dB`} onPreview={(value) => change("compressor", { threshold_db: value })} onCommit={(value) => change("compressor", { threshold_db: value }, true)} /><EffectSlider label="Ratio" value={focused.ratio} min={1} max={20} step={.5} format={(value) => `${value.toFixed(1)}:1`} onPreview={(value) => change("compressor", { ratio: value })} onCommit={(value) => change("compressor", { ratio: value }, true)} /><EffectSlider label="Attack" value={focused.attack_ms} min={.1} max={1_000} step={1} format={(value) => `${Math.round(value)} ms`} onPreview={(value) => change("compressor", { attack_ms: value })} onCommit={(value) => change("compressor", { attack_ms: value }, true)} /><EffectSlider label="Release" value={focused.release_ms} min={10} max={3_000} step={10} format={(value) => `${Math.round(value)} ms`} onPreview={(value) => change("compressor", { release_ms: value })} onCommit={(value) => change("compressor", { release_ms: value }, true)} /><EffectSlider label="Makeup" value={focused.makeup_db} min={0} max={24} step={.5} format={(value) => `+${value.toFixed(1)} dB`} onPreview={(value) => change("compressor", { makeup_db: value })} onCommit={(value) => change("compressor", { makeup_db: value }, true)} /></>}
      {focused.type === "echo" && <><EffectSlider label="Echo delay" value={focused.delay_ms} min={50} max={1_000} step={10} format={(value) => `${value} ms`} onPreview={(value) => change("echo", { delay_ms: value })} onCommit={(value) => change("echo", { delay_ms: value }, true)} /><EffectSlider label="Echo feedback" value={focused.feedback * 100} min={0} max={85} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("echo", { feedback: value / 100 })} onCommit={(value) => change("echo", { feedback: value / 100 }, true)} /><EffectSlider label="Echo mix" value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("echo", { mix: value / 100 })} onCommit={(value) => change("echo", { mix: value / 100 }, true)} /></>}
      {focused.type === "reverb" && <><EffectSlider label="Room size" value={focused.room_size * 100} min={10} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("reverb", { room_size: value / 100 })} onCommit={(value) => change("reverb", { room_size: value / 100 }, true)} /><EffectSlider label="Reverb mix" value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("reverb", { mix: value / 100 })} onCommit={(value) => change("reverb", { mix: value / 100 }, true)} /></>}
      {focused.type === "distortion" && <><EffectSlider label="Drive" value={focused.amount * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("distortion", { amount: value / 100 })} onCommit={(value) => change("distortion", { amount: value / 100 }, true)} /><EffectSlider label="Distortion mix" value={focused.mix * 100} min={0} max={100} step={1} format={(value) => `${Math.round(value)}%`} onPreview={(value) => change("distortion", { mix: value / 100 })} onCommit={(value) => change("distortion", { mix: value / 100 }, true)} /></>}
      {focused.type === "pan" && <EffectSlider label="Position" value={focused.pan * 100} min={-100} max={100} step={1} format={(value) => value === 0 ? "Centre" : `${Math.abs(Math.round(value))}% ${value < 0 ? "left" : "right"}`} onPreview={(value) => change("pan", { pan: value / 100 })} onCommit={(value) => change("pan", { pan: value / 100 }, true)} />}
    </div>}
  </OperatorInspectorSection>
}

function EffectSlider({ label, value, min, max, step, format, onPreview, onCommit }: {
  label: string; value: number; min: number; max: number; step: number
  format: (value: number) => string; onPreview: (value: number) => void; onCommit: (value: number) => void
}) {
  return <label><span>{label}<b>{format(value)}</b></span><Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([next = value]) => onPreview(next)} onValueCommit={([next = value]) => onCommit(next)} /></label>
}

export type SoundContext = {
  kind: "audio" | "sequence" | "silence"
  mediaKind?: SoundMediaKind
  label: string
  muted: boolean
  gain: number
  gainMixed?: boolean
  effects: SoundSceneEffect[]
  lockState?: "unlocked" | "locked" | "mixed"
  count?: number
}

export function SoundSceneContextToolbar({ context, saving, canSplit, onVolumePreview, onVolume, onEffectsPreview, onEffects, onLock, onSplit, onDuplicate, onCrossfade, onPlaySelection, onLoopSelection, onDelete }: {
  context: SoundContext | null
  saving: boolean
  canSplit?: boolean
  onVolumePreview?: (mix: AudioVolumeMix, relative: boolean) => void
  onVolume: (mix: AudioVolumeMix, relative: boolean) => void
  onEffectsPreview?: (effects: SoundSceneEffect[]) => void
  onEffects: (effects: SoundSceneEffect[]) => void
  onLock?: () => void
  onSplit?: () => void
  onDuplicate?: () => void
  onCrossfade?: () => void
  onPlaySelection?: () => void
  onLoopSelection?: () => void
  onDelete?: () => void
}) {
  if (!context) return null
  const lockState = context.lockState || "unlocked"
  const hasLockedClips = lockState !== "unlocked"
  const activeEffectCount = context.effects.filter((effect) => effect.enabled).length
  const lockLabel = lockState === "locked" ? "Unlock" : lockState === "mixed" ? "Lock all" : "Lock"
  const volumeLabel = context.kind === "sequence" ? "Part volume" : context.gainMixed ? "Selection volume" : "Clip volume"
  const volumeDetail = context.gainMixed
    ? "Adjust the selected clips relatively. Muting silences them without removing their placements."
    : context.kind === "sequence"
      ? "Adjust or mute this Script Part without changing its Script timing."
      : "Adjust or mute this clip without changing its Timeline placement."
  const meta = context.count && context.count > 1
    ? `${context.count} clips`
    : context.kind === "audio" ? SOUND_MEDIA_LABELS[context.mediaKind || "audio"] : context.kind === "silence" ? "Script pause" : "Script Part"
  const mixActions = context.kind !== "silence" ? <>
      <SelectionVolumeControl label={volumeLabel} detail={volumeDetail} gain={context.gain} muted={context.muted} mixed={Boolean(context.gainMixed)} disabled={saving} onPreview={(mix) => onVolumePreview?.(mix, Boolean(context.gainMixed))} onCommit={(mix) => onVolume(mix, Boolean(context.gainMixed))} />
      {(context.count === undefined || context.count === 1) ? <Popover><OperatorTooltip label="Effects" detail="Shape this placement with the browser-previewed effect chain." disabledTrigger={saving}><PopoverTrigger asChild><Button className={`selection-bar-command${activeEffectCount ? " is-active" : ""}`} variant="ghost" size="icon-sm" disabled={saving} aria-label={activeEffectCount ? `Effects · ${activeEffectCount} active` : "Effects"}><RadioTower />{activeEffectCount ? <small>{activeEffectCount}</small> : null}</Button></PopoverTrigger></OperatorTooltip><PopoverContent align="end" className="sound-effects-popover"><SoundEffectsEditor effects={context.effects} disabled={saving} subject={context.kind === "sequence" ? "Part" : "Clip"} onPreview={onEffectsPreview} onCommit={onEffects} /></PopoverContent></Popover> : null}
    </> : undefined
  const objectActions = context.kind === "audio" ? <>
      <OperatorIconButton label={lockLabel} detail="Prevents accidental movement, trimming and deletion." className={`selection-bar-command${hasLockedClips ? " is-locked" : ""}`} disabled={saving} onClick={onLock}>{lockState === "locked" ? <Lock /> : <Unlock />}</OperatorIconButton>
      <OperatorIconButton
        label="Split at playhead"
        detail={hasLockedClips
          ? "Every clip under the playhead must be unlocked."
          : canSplit === false
            ? "Keep the playhead at least 0.1 seconds away from either edge."
            : "Creates two non-destructive placements that continue to reference the same source Asset. Shortcut: S"}
        className="selection-bar-command"
        disabled={saving || hasLockedClips || canSplit === false}
        onClick={onSplit}
      ><Scissors /></OperatorIconButton>
      <OperatorIconButton label="Duplicate selected clips" detail="Creates another placement using the same source Asset." className="selection-bar-command" disabled={saving || hasLockedClips} onClick={onDuplicate}><Copy /></OperatorIconButton>
      <DropdownMenu><OperatorTooltip label="More playback actions" disabledTrigger={saving}><DropdownMenuTrigger asChild><Button className="selection-bar-command" variant="ghost" size="icon-sm" disabled={saving} aria-label="More playback actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onPlaySelection}><Play /> Play selection</DropdownMenuItem>
        <DropdownMenuItem onSelect={onLoopSelection}><Repeat2 /> Loop selection</DropdownMenuItem>
        {onCrossfade && <DropdownMenuItem onSelect={onCrossfade}><Blend /> Crossfade overlap</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>
      <OperatorIconButton label="Delete selected clips" detail="Removes the Timeline placement; the source Asset remains available in the Asset Library." className="selection-bar-command danger" disabled={saving || hasLockedClips} onClick={onDelete}><Trash2 /></OperatorIconButton>
    </> : undefined
  return <SelectionBar
    ariaLabel={`${context.label} actions`}
    icon={context.kind === "silence" ? <Pause /> : <SoundMediaIcon kind={context.kind === "sequence" ? "speech" : context.mediaKind || "audio"} />}
    label={context.label}
    meta={meta}
    metaTechnical={Boolean(context.count && context.count > 1)}
    mixActions={mixActions}
    objectActions={objectActions}
  />
}
