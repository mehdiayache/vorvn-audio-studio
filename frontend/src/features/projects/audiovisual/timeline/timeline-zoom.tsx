import { Maximize2, Minus, Plus } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

export function TimelineZoom({ index, maximum, pixelsPerSecond, onChange, onFit }: {
  index: number
  maximum: number
  pixelsPerSecond: number
  onChange: (index: number) => void
  onFit: () => void
}) {
  return <div className="sound-scene-zoom-dock" aria-label="Timeline view controls">
    <div className="sound-scene-zoom">
      <OperatorTooltip label="Zoom out" disabledTrigger={index === 0}><Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onChange(index - 1)} aria-label="Zoom out"><Minus /></Button></OperatorTooltip>
      <Slider aria-label="Timeline zoom" aria-valuetext={`${Math.round(pixelsPerSecond)} pixels per second`} value={[index]} min={0} max={maximum} step={1} onValueChange={([value = index]) => onChange(value)} />
      <OperatorTooltip label="Zoom in" disabledTrigger={index === maximum}><Button variant="ghost" size="icon-sm" disabled={index === maximum} onClick={() => onChange(index + 1)} aria-label="Zoom in"><Plus /></Button></OperatorTooltip>
    </div>
    <OperatorTooltip label="Fit the entire Project in view"><Button variant="ghost" size="sm" onClick={onFit} aria-label="Fit entire timeline"><Maximize2 /><span>Fit</span></Button></OperatorTooltip>
  </div>
}
