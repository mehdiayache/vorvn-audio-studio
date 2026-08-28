import { Plus, Settings2, Trash2 } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { VentureAsset } from "@/types/domain"
import { DirectorAssetListEditor } from "./director-asset-list-editor"
import type { DirectorModelCapability, DirectorOperationCapability, DirectorParameterCapability, DirectorParameterValues } from "./director-composer-config"

export type DirectorShot = { prompt: string; duration: number }
export type DirectorAdvancedValues = {
  seed: string
  fps: number
  negativePrompt: string
  parameters: DirectorParameterValues
}

function optionValue(option: unknown) {
  if (typeof option === "object" && option !== null && "value" in option) return String((option as { value: unknown }).value)
  return String(option)
}

function optionLabel(option: unknown) {
  if (typeof option === "object" && option !== null && "label" in option) return String((option as { label: unknown }).label)
  return String(option)
}

function visible(field: DirectorParameterCapability, values: DirectorParameterValues) {
  return Object.entries(field.visible_when).every(([key, expected]) => values[key] === expected)
}

function ScalarParameter({ field, value, onChange }: {
  field: DirectorParameterCapability
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.type === "boolean") return <label className="director-parameter-toggle">
    <span>{field.label}</span>
    <Switch checked={Boolean(value)} onCheckedChange={onChange} aria-label={field.label} />
  </label>
  if (field.type === "select") return <label><span>{field.label}</span><Select value={String(value ?? "")} onValueChange={onChange}>
    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{field.options.map((option) => <SelectItem key={optionValue(option)} value={optionValue(option)}>{optionLabel(option)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select></label>
  if (field.type === "textarea") return <label><span>{field.label}</span><Textarea rows={3} maxLength={field.max_length ?? undefined} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></label>
  if (field.type === "text") return <label><span>{field.label}</span><Input maxLength={field.max_length ?? undefined} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /></label>
  if (field.type === "integer" || field.type === "number") return <label><span>{field.label}</span><Input
    type="number" inputMode="decimal" min={field.min ?? undefined} max={field.max ?? undefined} step={field.step ?? (field.type === "integer" ? 1 : "any")}
    value={typeof value === "number" ? value : ""}
    onChange={(event) => onChange(event.target.value === "" ? null : field.type === "integer" ? Number.parseInt(event.target.value, 10) : Number(event.target.value))}
  /></label>
  return null
}

function ShotEditor({ field, value, onChange }: {
  field: DirectorParameterCapability
  value: unknown
  onChange: (value: DirectorShot[]) => void
}) {
  const shots = Array.isArray(value) ? value as DirectorShot[] : []
  const minimum = Number(field.item.duration_min || 1)
  const maximum = Number(field.item.duration_max || 60)
  const promptMaximum = Number(field.item.prompt_max_length || 500)
  const update = (index: number, changes: Partial<DirectorShot>) => onChange(shots.map((shot, current) => current === index ? { ...shot, ...changes } : shot))
  return <section className="director-shot-editor">
    <header><span>{field.label}</span><Button type="button" variant="outline" size="sm" onClick={() => onChange([...shots, { prompt: "", duration: minimum }])}><Plus /> Add shot</Button></header>
    {shots.length ? <div className="director-shot-list">{shots.map((shot, index) => <div className="director-shot-row" key={index}>
      <Textarea aria-label={`Shot ${index + 1} direction`} rows={2} maxLength={promptMaximum} placeholder={`Shot ${index + 1} direction`} value={shot.prompt} onChange={(event) => update(index, { prompt: event.target.value })} />
      <label><span>Seconds</span><Input aria-label={`Shot ${index + 1} duration`} type="number" min={minimum} max={maximum} step={1} value={shot.duration} onChange={(event) => update(index, { duration: Number.parseInt(event.target.value || String(minimum), 10) })} /></label>
      <OperatorIconButton type="button" label={`Remove shot ${index + 1}`} detail="Removes this shot from the generation plan." size="icon-xs" onClick={() => onChange(shots.filter((_, current) => current !== index))}><Trash2 /></OperatorIconButton>
    </div>)}</div> : <p className="director-shot-empty">Add shots whose durations together equal the final video duration.</p>}
  </section>
}

export function DirectorAdvancedSettings({ model, capability, values, assets, onChange }: {
  model: DirectorModelCapability
  capability: DirectorOperationCapability
  values: DirectorAdvancedValues
  assets: VentureAsset[]
  onChange: (values: DirectorAdvancedValues) => void
}) {
  const parameters = capability.parameters.filter((field) => visible(field, values.parameters))
  const available = capability.supports_seed || capability.prompt.negative_prompt || capability.fps.length > 1 || parameters.length > 0
  if (!available) return null
  const setParameter = (key: string, value: unknown) => onChange({ ...values, parameters: { ...values.parameters, [key]: value } })
  return <Popover>
    <OperatorTooltip label="Model settings" detail="Only controls declared by the selected model are shown.">
      <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="Model settings"><Settings2 /></Button></PopoverTrigger>
    </OperatorTooltip>
    <PopoverContent side="top" align="end" className="director-advanced-popover">
      <header><strong>Model settings</strong><span>{model.label}</span></header>
      {capability.supports_seed && <label><span>Seed</span><Input inputMode="numeric" value={values.seed} placeholder="Random" onChange={(event) => onChange({ ...values, seed: event.target.value })} /></label>}
      {capability.fps.length > 1 && <label><span>Frame rate</span><Select value={String(values.fps)} onValueChange={(value) => onChange({ ...values, fps: Number(value) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{capability.fps.map((fps) => <SelectItem key={fps} value={String(fps)}>{fps} fps</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      {capability.prompt.negative_prompt && <label><span>Exclude</span><Textarea rows={3} value={values.negativePrompt} placeholder="Anything that should not appear" onChange={(event) => onChange({ ...values, negativePrompt: event.target.value })} /></label>}
      {parameters.map((field) => field.type === "structured_shots"
        ? <ShotEditor key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />
        : field.type === "asset_list"
          ? <DirectorAssetListEditor key={field.key} field={field} value={values.parameters[field.key]} assets={assets} onChange={(value) => setParameter(field.key, value)} />
          : <ScalarParameter key={field.key} field={field} value={values.parameters[field.key]} onChange={(value) => setParameter(field.key, value)} />)}
    </PopoverContent>
  </Popover>
}
