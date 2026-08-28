import { Clock3, Frame, MonitorUp } from "lucide-react"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OperatorTooltip } from "@/components/operator-tooltip"
import type { DirectorModelCapability, DirectorOperation } from "./director-composer-config"

function InlineSelect({ label, value, values, onValueChange, icon: Icon }: { label: string; value: string; values: string[]; onValueChange: (value: string) => void; icon: typeof Frame }) {
  if (values.length < 2) return values[0] ? <span className="director-capability-static"><Icon />{values[0]}</span> : null
  return <Select value={value} onValueChange={onValueChange}>
    <OperatorTooltip label={label}><SelectTrigger size="sm" aria-label={label} className="director-capability-select"><Icon /><SelectValue /></SelectTrigger></OperatorTooltip>
    <SelectContent side="top" align="start"><SelectGroup>{values.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}

export function DirectorCapabilityControls({ operation, model, ratio, resolution, duration, onRatioChange, onResolutionChange, onDurationChange }: {
  operation: DirectorOperation
  model: DirectorModelCapability
  ratio: string
  resolution: string
  duration: number
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
}) {
  const video = operation !== "image"
  return <div className="director-capability-controls">
    <InlineSelect label="Aspect ratio" value={ratio} values={model.ratios} onValueChange={onRatioChange} icon={Frame} />
    <InlineSelect label={video ? "Video resolution" : "Image size"} value={resolution} values={model.resolutions} onValueChange={onResolutionChange} icon={MonitorUp} />
    {video && <InlineSelect label="Duration" value={String(duration)} values={model.durations.map(String)} onValueChange={(value) => onDurationChange(Number(value))} icon={Clock3} />}
  </div>
}
