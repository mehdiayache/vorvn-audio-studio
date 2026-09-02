import { ChevronDown, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { WorkspaceFile } from "@/types/domain"
import type { CreatorContext } from "@/lib/api"
import { MediaFileListEditor } from "./media-file-list-editor"
import { withParameterValue, type MediaModelCapability, type MediaOperationCapability, type MediaParameterValues } from "./media-creator-config"
import { MediaScalarParameter, MediaShotEditor, mediaParameterIsVisible } from "./media-parameter-editor"

export type MediaAdvancedValues = {
  seed: string
  fps: number
  negativePrompt: string
  parameters: MediaParameterValues
}

export function MediaAdvancedSettings({ context, model, capability, values, files, onChange }: {
  context: CreatorContext
  model: MediaModelCapability
  capability: MediaOperationCapability
  values: MediaAdvancedValues
  files: WorkspaceFile[]
  onChange: (values: MediaAdvancedValues) => void
}) {
  const parameters = capability.parameters.filter((field) => field.exposure === "advanced" && mediaParameterIsVisible(field, values.parameters))
  const setParameter = (key: string, value: unknown) => {
    const field = capability.parameters.find((candidate) => candidate.key === key)
    if (field) onChange({ ...values, parameters: withParameterValue(field, values.parameters, value) })
  }
  return <Collapsible className="media-advanced-settings">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" className="media-advanced-trigger" aria-label="Advanced settings">
        <Settings2 /><span>Advanced settings</span><small>{model.label}</small><ChevronDown />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="media-advanced-content">
      {capability.supports_seed && <label><span>Seed</span><Input inputMode="numeric" value={values.seed} placeholder="Random" onChange={(event) => onChange({ ...values, seed: event.target.value })} /></label>}
      {capability.fps.length > 1 && <label><span>Frame rate</span><Select value={String(values.fps)} onValueChange={(value) => onChange({ ...values, fps: Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{capability.fps.map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      {capability.prompt.negative_prompt && <label><span>Exclude</span><Textarea rows={3} value={values.negativePrompt} placeholder="Anything that should not appear" onChange={(event) => onChange({ ...values, negativePrompt: event.target.value })} /></label>}
      {parameters.map((field) => field.type === "structured_shots"
        ? <MediaShotEditor key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />
        : field.type === "file_list"
          ? <MediaFileListEditor key={field.key} context={context} modelId={model.id} operation={capability.operation} field={field} value={values.parameters[field.key]} files={files} onChange={(value) => setParameter(field.key, value)} />
          : <MediaScalarParameter key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />)}
    </CollapsibleContent>
  </Collapsible>
}
