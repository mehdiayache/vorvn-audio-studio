import {Blend, Copy, Lock, MoreHorizontal, Pause, Play, RadioTower, Repeat2, Scissors, Trash2, Unlock} from "lucide-react"

import { Button } from "@/components/ui/button"
import { SelectionBar } from "@/components/selection-bar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type {AudioEffect as SoundSceneEffect} from "../../lib/audio-effects"
import { SOUND_MEDIA_LABELS, SoundMediaIcon, type SoundMediaKind } from "./studio-audio-presentation"
import type { AudioVolumeMix } from "./audio-volume-control"
import { SelectionVolumeControl } from "./selection-volume-control"

import {SoundEffectsEditor} from "@/components/audio-effects-editor"
export {SoundEffectsEditor} from "@/components/audio-effects-editor"

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

export function SoundSceneContextToolbar({ context, saving, disabled: disabledInput = false, renderSupported = true, canSplit, onVolumePreview, onVolume, onEffectsPreview, onEffects, onLock, onSplit, onDuplicate, onCrossfade, onPlaySelection, onLoopSelection, onDelete }: {
  context: SoundContext | null
  saving: boolean
  disabled?: boolean
  renderSupported?: boolean
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
  const disabled = saving || disabledInput
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
      <SelectionVolumeControl label={volumeLabel} detail={volumeDetail} gain={context.gain} muted={context.muted} mixed={Boolean(context.gainMixed)} disabled={disabled} onPreview={(mix) => onVolumePreview?.(mix, Boolean(context.gainMixed))} onCommit={(mix) => onVolume(mix, Boolean(context.gainMixed))} />
      {(context.count === undefined || context.count === 1) ? <Popover><OperatorTooltip label="Effects" detail="Shape this placement with the browser-previewed effect chain." disabledTrigger={disabled}><PopoverTrigger asChild><Button className={`selection-bar-command${activeEffectCount ? " is-active" : ""}`} variant="ghost" size="icon-sm" disabled={disabled} aria-label={activeEffectCount ? `Effects · ${activeEffectCount} active` : "Effects"}><RadioTower />{activeEffectCount ? <small>{activeEffectCount}</small> : null}</Button></PopoverTrigger></OperatorTooltip><PopoverContent align="end" className="sound-effects-popover"><SoundEffectsEditor renderSupported={renderSupported} effects={context.effects} disabled={disabled} subject={context.kind === "sequence" ? "Part" : "Clip"} onPreview={onEffectsPreview} onCommit={onEffects} /></PopoverContent></Popover> : null}
    </> : undefined
  const objectActions = context.kind === "audio" && (onLock || onSplit || onDuplicate || onPlaySelection || onLoopSelection || onCrossfade || onDelete) ? <>
      {onLock && <OperatorIconButton label={lockLabel} detail="Prevents accidental movement, trimming and deletion." className={`selection-bar-command${hasLockedClips ? " is-locked" : ""}`} disabled={disabled} onClick={onLock}>{lockState === "locked" ? <Lock /> : <Unlock />}</OperatorIconButton>}
      {onSplit && <OperatorIconButton
        label="Split at playhead"
        detail={hasLockedClips
          ? "Every clip under the playhead must be unlocked."
          : canSplit === false
            ? "Keep the playhead at least 0.1 seconds away from either edge."
            : "Creates two non-destructive placements that continue to reference the same source File. Shortcut: S"}
        className="selection-bar-command"
        disabled={disabled || hasLockedClips || canSplit === false}
        onClick={onSplit}
      ><Scissors /></OperatorIconButton>}
      {onDuplicate && <OperatorIconButton label="Duplicate selected clips" detail="Creates another placement using the same source File." className="selection-bar-command" disabled={disabled || hasLockedClips} onClick={onDuplicate}><Copy /></OperatorIconButton>}
      {(onPlaySelection || onLoopSelection || onCrossfade) && <DropdownMenu><OperatorTooltip label="More playback actions" disabledTrigger={disabled}><DropdownMenuTrigger asChild><Button className="selection-bar-command" variant="ghost" size="icon-sm" disabled={disabled} aria-label="More playback actions"><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end">
        {onPlaySelection && <DropdownMenuItem onSelect={onPlaySelection}><Play /> Play selection</DropdownMenuItem>}
        {onLoopSelection && <DropdownMenuItem onSelect={onLoopSelection}><Repeat2 /> Loop selection</DropdownMenuItem>}
        {onCrossfade && <DropdownMenuItem onSelect={onCrossfade}><Blend /> Crossfade overlap</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>}
      {onDelete && <OperatorIconButton label="Delete selected clips" detail="Removes the Timeline placement; the source File remains available in the File Library." className="selection-bar-command danger" disabled={disabled || hasLockedClips} onClick={onDelete}><Trash2 /></OperatorIconButton>}
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
