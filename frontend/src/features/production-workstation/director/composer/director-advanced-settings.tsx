import { ChevronDown, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { VentureAsset } from "@/types/domain"
import { DirectorAssetListEditor } from "./director-asset-list-editor"
import { withParameterValue, type DirectorModelCapability, type DirectorOperationCapability, type DirectorParameterValues } from "./director-composer-config"
import { DirectorScalarParameter, DirectorShotEditor, directorParameterIsVisible } from "./director-parameter-editor"

export type DirectorAdvancedValues = {
  seed: string
  fps: number
  negativePrompt: string
  parameters: DirectorParameterValues
}

export function DirectorAdvancedSettings({ productionId, model, capability, values, assets, onChange }: {
  productionId: number
  model: DirectorModelCapability
  capability: DirectorOperationCapability
  values: DirectorAdvancedValues
  assets: VentureAsset[]
  onChange: (values: DirectorAdvancedValues) => void
}) {
  const parameters = capability.parameters.filter((field) => field.exposure === "advanced" && directorParameterIsVisible(field, values.parameters))
  const setParameter = (key: string, value: unknown) => {
    const field = capability.parameters.find((candidate) => candidate.key === key)
    if (field) onChange({ ...values, parameters: withParameterValue(field, values.parameters, value) })
  }
  return <Collapsible className="director-advanced-settings">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="director-advanced-trigger" aria-label="Advanced settings">
        <Settings2 /><span>Advanced settings</span><small>{model.label}</small><ChevronDown />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="director-advanced-content">
      {capability.supports_seed && <label><span>Seed</span><Input inputMode="numeric" value={values.seed} placeholder="Random" onChange={(event) => onChange({ ...values, seed: event.target.value })} /></label>}
      {capability.fps.length > 1 && <label><span>Frame rate</span><Select value={String(values.fps)} onValueChange={(value) => onChange({ ...values, fps: Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{capability.fps.map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      {capability.prompt.negative_prompt && <label><span>Exclude</span><Textarea rows={3} value={values.negativePrompt} placeholder="Anything that should not appear" onChange={(event) => onChange({ ...values, negativePrompt: event.target.value })} /></label>}
      {parameters.map((field) => field.type === "structured_shots"
        ? <DirectorShotEditor key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />
        : field.type === "asset_list"
          ? <DirectorAssetListEditor key={field.key} productionId={productionId} modelId={model.id} operation={capability.operation} field={field} value={values.parameters[field.key]} assets={assets} onChange={(value) => setParameter(field.key, value)} />
          : <DirectorScalarParameter key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />)}
    </CollapsibleContent>
  </Collapsible>
}
