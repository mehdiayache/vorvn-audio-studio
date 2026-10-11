import { Film, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AUDIO_FAMILY_LABELS, SoundMediaIcon, type AudioFamily } from "./studio-audio-presentation"
import type { SoundSceneTrack, WorkspaceFile, VisualSceneTrack, SoundSceneEngineState } from "./studio-timeline-model"
import { AudioTrackHeaders } from "./audio-timeline-section"
import { VisualTrackHeaders } from "./visual-timeline-section"


export interface AudioTrackSessionPort {
  addTrack(file?: undefined, timelinePosition?: number, role?: AudioFamily): Promise<unknown> | void
  commitTrackMix(trackId: string, mix: {volume: number; muted: boolean}): Promise<unknown> | void
  setTrackMix(trackId: string, mix: {volume: number; muted: boolean}): void
  toggleTrackSolo(trackId: string): void
  renameTrack(trackId: string, name: string): Promise<unknown> | void
  setTrackRole(trackId: string, role: AudioFamily): Promise<unknown> | void
  reportError?(message: string): void
}
export interface VisualTrackSessionPort {
  addTrack(mediaType: "image" | "video"): Promise<unknown> | void
  setTrackVisible(trackId: string, visible: boolean): Promise<unknown> | void
  setTrackLocked(trackId: string, locked: boolean): Promise<unknown> | void
  moveTrack(trackId: string, direction: -1 | 1): Promise<unknown> | void
  renameTrack(trackId: string, name: string): Promise<unknown> | void
  reportError?(message: string): void
}

export function TimelineTrackControls({ audioSession, visualSession, audioTracks, engineTracks, visualTracks, files, collapsed, soloTrackIds, sequenceSummary, onCollapsedChange, onAddAudio, onAddVisual, onRemoveAudioTrack, onRemoveVisualTrack, editable = true, saving = false }: {
  audioSession: AudioTrackSessionPort
  visualSession?: VisualTrackSessionPort
  audioTracks: SoundSceneTrack[]
  engineTracks: SoundSceneEngineState["tracks"]
  visualTracks: VisualSceneTrack[]
  files: WorkspaceFile[]
  collapsed: boolean
  editable?: boolean
  saving?: boolean
  soloTrackIds: string[]
  sequenceSummary: string
  onCollapsedChange: (collapsed: boolean) => void
  onAddAudio: (trackId?: string) => void
  onAddVisual: (trackId?: string) => void
  onRemoveAudioTrack: (track: SoundSceneTrack) => void
  onRemoveVisualTrack: (track: VisualSceneTrack) => void
}) {
  const disabled = !editable || saving
  const run = (owner: {reportError?(message: string): void} | undefined, action: () => Promise<unknown> | void) => {
    if (disabled) return
    try { Promise.resolve(action()).catch(reason => owner?.reportError?.(reason instanceof Error ? reason.message : "The track could not be updated.")) }
    catch (reason) { owner?.reportError?.(reason instanceof Error ? reason.message : "The track could not be updated.") }
  }
  return <>
    <div className="sound-scene-track-head">
      <span>Tracks</span>
      <div className="sound-scene-track-head-actions">
        {!collapsed && <DropdownMenu>
          <OperatorTooltip label="Create an empty Timeline track" detail="Choose the media type now, then add compatible sources inside that track.">
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={disabled} aria-label="New Timeline track"><Plus data-icon="inline-start" />New track</Button></DropdownMenuTrigger>
          </OperatorTooltip>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuLabel>Visual</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => run(visualSession, () => visualSession?.addTrack("image"))} disabled={disabled || !visualSession}><ImageIcon /> Image</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(visualSession, () => visualSession?.addTrack("video"))} disabled={disabled || !visualSession}><Film /> Video</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuLabel>Audio</DropdownMenuLabel>
            <DropdownMenuGroup>{(Object.keys(AUDIO_FAMILY_LABELS) as AudioFamily[]).map((role) => <DropdownMenuItem key={role} disabled={disabled} onSelect={() => run(audioSession, () => audioSession.addTrack(undefined, 0, role))}><SoundMediaIcon kind={role} /> {AUDIO_FAMILY_LABELS[role]}</DropdownMenuItem>)}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        <OperatorTooltip label={collapsed ? "Show track controls" : "Hide track controls"}>
          <Button variant="ghost" size="icon-sm" onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? "Show track controls" : "Hide track controls"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        </OperatorTooltip>
      </div>
    </div>
    <VisualTrackHeaders
      tracks={visualTracks}
      files={files}
      collapsed={collapsed}
      disabled={disabled}
      onVisible={(track) => run(visualSession, () => visualSession?.setTrackVisible(track.id, !track.visible))}
      onLocked={(track) => run(visualSession, () => visualSession?.setTrackLocked(track.id, !track.locked))}
      onAdd={trackId => { if (!disabled) onAddVisual(trackId) }}
      onMove={(trackId, direction) => run(visualSession, () => visualSession?.moveTrack(trackId, direction))}
      onRename={(trackId, name) => run(visualSession, () => visualSession?.renameTrack(trackId, name))}
      onRemove={track => { if (!disabled) onRemoveVisualTrack(track) }}
    />
    <AudioTrackHeaders
      tracks={audioTracks}
      engineTracks={engineTracks}
      collapsed={collapsed}
      disabled={disabled}
      soloTrackIds={soloTrackIds}
      sequenceSummary={sequenceSummary}
      onMute={(track) => run(audioSession, () => audioSession.commitTrackMix(track.id, { volume: track.volume > 0 ? track.volume : 1, muted: !(track.muted || track.volume <= 0) }))}
      onSolo={(track) => audioSession.toggleTrackSolo(track.id)}
      onVolumeChange={(track, mix) => { if (!disabled) audioSession.setTrackMix(track.id, { volume: mix.gain, muted: mix.muted }) }}
      onVolumeCommit={(track, mix) => run(audioSession, () => audioSession.commitTrackMix(track.id, { volume: mix.gain, muted: mix.muted }))}
      onAdd={(track) => { if (!disabled) onAddAudio(track.id) }}
      onRename={(track, name) => run(audioSession, () => audioSession.renameTrack(track.id, name))}
      onRole={(track, role) => run(audioSession, () => audioSession.setTrackRole(track.id, role))}
      onRemove={track => { if (!disabled) onRemoveAudioTrack(track) }}
    />
  </>
}
