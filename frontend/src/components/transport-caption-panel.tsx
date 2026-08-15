import { Captions } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CAPTION_PRESENTATION_MODES, isCaptionPresentationMode } from "@/lib/caption-presentation"
import type { CaptionProfile, PlayerCaptionCue, PlayerCaptionTrack } from "@/types/domain"

type TransportCaptionPanelProps = {
  tracks: PlayerCaptionTrack[]
  track: PlayerCaptionTrack
  profile: CaptionProfile
  currentCue: PlayerCaptionCue | null
  onTrackChange?: (trackId: string | null) => void
  onProfileChange?: (profile: CaptionProfile) => void
  onOpenCue?: (partId: number) => void
}

export function TransportCaptionPanel({ tracks, track, profile, currentCue, onTrackChange, onProfileChange, onOpenCue }: TransportCaptionPanelProps) {
  const captionText = currentCue?.text || ""
  const canOpenCue = Boolean(currentCue?.partId && onOpenCue)

  return <div className="transport-caption-panel" aria-label="Caption display">
    <div className="transport-caption-reader" aria-live="polite" aria-atomic="true" dir="auto">
      <Captions aria-hidden="true" />
      {canOpenCue
        ? <button type="button" className="transport-caption-text" onClick={() => onOpenCue?.(currentCue!.partId!)} aria-label={`Open captions for: ${captionText}`}>{captionText}</button>
        : <span className={`transport-caption-text${currentCue ? "" : " is-gap"}`} aria-label={currentCue ? undefined : "No active caption"}>{captionText}</span>}
    </div>
    <div className="transport-caption-controls" aria-label="Caption settings">
      <Select value={track.id} onValueChange={(value) => onTrackChange?.(value)}>
        <SelectTrigger size="sm" className="transport-caption-language" aria-label="Caption language">
          <SelectValue>{track.language}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="end" side="top" sideOffset={10}>
          {tracks.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}{item.stale ? " · stale" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      <ToggleGroup type="single" variant="outline" size="sm" value={profile} onValueChange={(value) => {
        if (isCaptionPresentationMode(value)) onProfileChange?.(value)
      }} aria-label="Caption display mode" className="transport-caption-modes">
        {CAPTION_PRESENTATION_MODES.map((mode) => <ToggleGroupItem key={mode.key} value={mode.key} aria-label={mode.label} title={mode.detail}>{mode.label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  </div>
}
