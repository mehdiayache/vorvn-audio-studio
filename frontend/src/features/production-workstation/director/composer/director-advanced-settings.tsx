import { Settings2 } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DirectorModelCapability, DirectorOperationCapability } from "./director-composer-config"

export type DirectorAdvancedValues = { seed: string; fps: number; negativePrompt: string }

export function DirectorAdvancedSettings({ model, capability, values, onChange }: { model: DirectorModelCapability; capability: DirectorOperationCapability; values: DirectorAdvancedValues; onChange: (values: DirectorAdvancedValues) => void }) {
  const available = capability.supports_seed || capability.prompt.negative_prompt || capability.fps.length > 1
  if (!available) return null
  return <Popover>
    <OperatorTooltip label="Advanced settings" detail="Seed, frame rate and exclusions supported by this model.">
      <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Advanced settings"><Settings2 /></Button></PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent side="top" align="end" className="director-advanced-popover">
      <header><strong>Advanced</strong><span>{model.label}</span></header>
      {capability.supports_seed && <label><span>Seed</span><Input inputMode="numeric" value={values.seed} placeholder="Random" onChange={(event) => onChange({ ...values, seed: event.target.value })} /></label>}
      {capability.fps.length > 1 && <label><span>Frame rate</span><Select value={String(values.fps)} onValueChange={(value) => onChange({ ...values, fps: Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{capability.fps.map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      {capability.prompt.negative_prompt && <label><span>Exclude</span><Textarea rows={3} value={values.negativePrompt} placeholder="Anything that should not appear" onChange={(event) => onChange({ ...values, negativePrompt: event.target.value })} /></label>}
    </PopoverContent>
  </Popover>
}
