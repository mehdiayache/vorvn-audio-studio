import { AudioWaveform, Film, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { SoundSceneEngineState } from "@/features/sound-scene/engine/sound-scene-engine"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { SoundSceneTrack, VentureAsset, VisualSceneTrack } from "@/types/domain"
import { AudioTrackHeaders } from "./audio-timeline-section"
import { VisualTrackHeaders } from "./visual-timeline-section"

export function TimelineTrackControls({ audioSession, visualSession, audioTracks, engineTracks, visualTracks, assets, collapsed, soloTrackIds, sequenceSummary, onCollapsedChange, onAddAudio, onAddVisual, onRemoveAudioTrack, onRemoveVisualTrack }: {
  audioSession: SoundSceneSession
  visualSession?: VisualSceneSession
  audioTracks: SoundSceneTrack[]
  engineTracks: SoundSceneEngineState["tracks"]
  visualTracks: VisualSceneTrack[]
  assets: VentureAsset[]
  collapsed: boolean
  soloTrackIds: string[]
  sequenceSummary: string
  onCollapsedChange: (collapsed: boolean) => void
  onAddAudio: (trackId?: string) => void
  onAddVisual: (trackId?: string) => void
  onRemoveAudioTrack: (track: SoundSceneTrack) => void
  onRemoveVisualTrack: (track: VisualSceneTrack) => void
}) {
  return <>
    <div className="sound-scene-track-head">
      <span>Tracks</span>
      <div className="sound-scene-track-head-actions">
        {!collapsed && <DropdownMenu>
          <OperatorTooltip label="Create an empty Timeline track" detail="Choose the media type now, then add compatible sources inside that track.">
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="New Timeline track"><Plus data-icon="inline-start" />New track</Button></DropdownMenuTrigger>
          </OperatorTooltip>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuLabel>Empty track</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => void visualSession?.addTrack("image")} disabled={!visualSession}><ImageIcon /> Image</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void visualSession?.addTrack("video")} disabled={!visualSession}><Film /> Video</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void audioSession.addTrack()}><AudioWaveform /> Audio</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        <OperatorTooltip label={collapsed ? "Show track controls" : "Hide track controls"}>
          <Button variant="ghost" size="icon-sm" onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? "Show track controls" : "Hide track controls"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        </OperatorTooltip>
      </div>
    </div>
    <VisualTrackHeaders
      tracks={visualTracks}
      assets={assets}
      collapsed={collapsed}
      onVisible={(track) => void visualSession?.setTrackVisible(track.id, !track.visible)}
      onLocked={(track) => void visualSession?.setTrackLocked(track.id, !track.locked)}
      onAdd={onAddVisual}
      onMove={(trackId, direction) => void visualSession?.moveTrack(trackId, direction)}
      onRename={(trackId, name) => void visualSession?.renameTrack(trackId, name)}
      onRemove={onRemoveVisualTrack}
    />
    <AudioTrackHeaders
      tracks={audioTracks}
      engineTracks={engineTracks}
      collapsed={collapsed}
      soloTrackIds={soloTrackIds}
      sequenceSummary={sequenceSummary}
      onMute={(track) => void audioSession.commitTrackMix(track.id, { volume: track.volume > 0 ? track.volume : 1, muted: !(track.muted || track.volume <= 0) })}
      onSolo={(track) => audioSession.toggleTrackSolo(track.id)}
      onVolumeChange={(track, mix) => audioSession.setTrackMix(track.id, { volume: mix.gain, muted: mix.muted })}
      onVolumeCommit={(track, mix) => void audioSession.commitTrackMix(track.id, { volume: mix.gain, muted: mix.muted })}
      onAdd={(track) => onAddAudio(track.id)}
      onRemove={onRemoveAudioTrack}
    />
  </>
}
