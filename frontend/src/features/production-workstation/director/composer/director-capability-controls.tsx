import { Clock3, Frame, MonitorUp } from "lucide-react"

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OperatorTooltip } from "@/components/operator-tooltip"
import type { DirectorOperationCapability } from "./director-composer-config"

function InlineSelect({ label, value, values, onValueChange, icon: Icon }: { label: string; value: string; values: string[]; onValueChange: (value: string) => void; icon: typeof Frame }) {
  if (values.length < 2) return values[0] ? <span className="director-capability-static"><Icon />{values[0]}</span> : null
  return <Select value={value} onValueChange={onValueChange}>
    <OperatorTooltip label={label}><SelectTrigger size="sm" aria-label={label} className="director-capability-select"><Icon /><SelectValue /></SelectTrigger></OperatorTooltip>
    <SelectContent side="top" align="start"><SelectGroup>{values.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}

export function DirectorCapabilityControls({ capability, ratio, resolution, duration, onRatioChange, onResolutionChange, onDurationChange }: {
  capability: DirectorOperationCapability
  ratio: string
  resolution: string
  duration: number
  onRatioChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onDurationChange: (value: number) => void
}) {
  const video = capability.output_media_type === "video"
  return <div className="director-capability-controls">
    <InlineSelect label="Aspect ratio" value={ratio} values={capability.ratios} onValueChange={onRatioChange} icon={Frame} />
    <InlineSelect label={video ? "Video resolution" : "Image size"} value={resolution} values={capability.resolutions} onValueChange={onResolutionChange} icon={MonitorUp} />
    {capability.durations.length > 0 && <InlineSelect label="Duration" value={String(duration)} values={capability.durations.map(String)} onValueChange={(value) => onDurationChange(Number(value))} icon={Clock3} />}
  </div>
}
