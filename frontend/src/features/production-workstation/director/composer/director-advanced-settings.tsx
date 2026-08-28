import { Settings2 } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { withParameterValue, type DirectorModelCapability, type DirectorOperationCapability, type DirectorParameterValues } from "./director-composer-config"
import { DirectorScalarParameter, directorParameterIsVisible } from "./director-parameter-editor"

export type DirectorAdvancedValues = {
  seed: string
  fps: number
  negativePrompt: string
  parameters: DirectorParameterValues
}

export function DirectorAdvancedSettings({ model, capability, values, onChange }: {
  model: DirectorModelCapability
  capability: DirectorOperationCapability
  values: DirectorAdvancedValues
  onChange: (values: DirectorAdvancedValues) => void
}) {
  const parameters = capability.parameters.filter((field) => field.exposure === "advanced" && directorParameterIsVisible(field, values.parameters))
  const available = capability.supports_seed || capability.prompt.negative_prompt || capability.fps.length > 1 || parameters.length > 0
  if (!available) return null
  const setParameter = (key: string, value: unknown) => {
    const field = capability.parameters.find((candidate) => candidate.key === key)
    if (field) onChange({ ...values, parameters: withParameterValue(field, values.parameters, value) })
  }
  return <Popover>
    <OperatorTooltip label="Model settings" detail="Only controls declared by the selected model are shown.">
      <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Model settings"><Settings2 /></Button></PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent side="top" align="end" className="director-advanced-popover">
      <header><strong>Model settings</strong><span>{model.label}</span></header>
      {capability.supports_seed && <label><span>Seed</span><Input inputMode="numeric" value={values.seed} placeholder="Random" onChange={(event) => onChange({ ...values, seed: event.target.value })} /></label>}
      {capability.fps.length > 1 && <label><span>Frame rate</span><Select value={String(values.fps)} onValueChange={(value) => onChange({ ...values, fps: Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{capability.fps.map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      {capability.prompt.negative_prompt && <label><span>Exclude</span><Textarea rows={3} value={values.negativePrompt} placeholder="Anything that should not appear" onChange={(event) => onChange({ ...values, negativePrompt: event.target.value })} /></label>}
      {parameters.map((field) => <DirectorScalarParameter key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />)}
    </PopoverContent>
  </Popover>
}
