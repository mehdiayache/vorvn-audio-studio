import {TIMELINE_TRACK_COLORS, trackColorStyle, type TimelineTrackColor} from "@/lib/timeline-track-colors"
import {Button} from "@/components/ui/button"
import "./timeline-track-colors.css"

export function TrackColorChoices({value,disabled,onChange}:{value?:TimelineTrackColor;disabled?:boolean;onChange:(color:TimelineTrackColor)=>void}) {
  return <div className="timeline-track-color-choices" role="group" aria-label="Track color">
    {(Object.keys(TIMELINE_TRACK_COLORS) as TimelineTrackColor[]).map(color =>
      <Button key={color} variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Track color: ${color}`}
        aria-pressed={value===color} style={trackColorStyle("",color)} onClick={()=>onChange(color)}>
        <span aria-hidden="true"/>{value===color&&<span className="track-color-selected" aria-hidden="true">✓</span>}
      </Button>)}
  </div>
}
