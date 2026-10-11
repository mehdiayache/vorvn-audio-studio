import { StudioTimelineZoom } from "@/components/studio-timeline-controls"
import { soundSceneZoomLevel } from "@/features/sound-scene/engine/sound-scene-engine"

export function TimelineZoom({ index, maximum, pixelsPerSecond, onChange, onFit }: {
  index: number; maximum: number; pixelsPerSecond: number
  onChange: (index: number) => void; onFit: () => void
}) {
  const steps = Array.from({ length: maximum + 1 }, (_, position) => 48_000 / soundSceneZoomLevel(position))
  return <StudioTimelineZoom pixelsPerSecond={steps[index] ?? pixelsPerSecond} zoomSteps={steps}
    onChange={value => onChange(steps.indexOf(value))} onFit={onFit} />
}
