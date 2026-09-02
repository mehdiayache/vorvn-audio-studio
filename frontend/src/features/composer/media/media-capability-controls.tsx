import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ratioChoices, type MediaOperationCapability, type MediaParameterValues } from "./media-composer-config"

function ControlSelect({ label, value, values, onValueChange }: { label: string; value: string; values: string[]; onValueChange: (value: string) => void }) {
  if (!values.length) return null
  return <label className="media-control-field">
    <span>{label}</span>
    {values.length < 2
      ? <output className="media-capability-static" aria-label={label}>{values[0]}</output>
      : <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label} className="media-capability-select"><SelectValue /></SelectTrigger>
        <SelectContent align="start"><SelectGroup>{values.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>}
  </label>
}

export function MediaCapabilityControls({ capability, parameters, ratio, resolution, duration, onRatioChange, onResolutionChange, onDurationChange }: {
  capability: MediaOperationCapability
  parameters: MediaParameterValues
  ratio: string
  resolution: string
  duration: number
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
}) {
  const video = capability.output_media_type === "video"
  const ratios = ratioChoices(capability, parameters).values
  return <div className="media-capability-controls">
    <ControlSelect label="Ratio" value={ratio} values={ratios} onValueChange={onRatioChange} />
    <ControlSelect label={video ? "Resolution" : "Image size"} value={resolution} values={capability.resolutions} onValueChange={onResolutionChange} />
    {capability.durations.length > 0 && <ControlSelect label="Duration" value={String(duration)} values={capability.durations.map(String)} onValueChange={(value) => onDurationChange(Number(value))} />}
    {capability.duration_range && <label className="media-control-field media-duration-field">
      <span>Duration <output>{duration}s</output></span>
      <Slider
        aria-label="Duration in seconds"
        min={capability.duration_range.min}
        max={capability.duration_range.max}
        step={capability.duration_range.step}
        value={[duration]}
        onValueChange={(value) => onDurationChange(value[0] ?? capability.duration_range!.default)}
      />
      <small>{capability.duration_range.min}s <span>1-second steps</span> {capability.duration_range.max}s</small>
    </label>}
  </div>
}
