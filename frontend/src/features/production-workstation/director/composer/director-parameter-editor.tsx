import { Plus, Trash2 } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { DirectorParameterCapability, DirectorParameterValues } from "./director-composer-config"

export type DirectorShot = { prompt: string; duration: number }

export function directorParameterIsVisible(field: DirectorParameterCapability, values: DirectorParameterValues) {
  return Object.entries(field.visible_when).every(([key, expected]) => values[key] === expected)
}

function optionValue(option: unknown) {
  if (typeof option === "object" && option !== null && "value" in option) return String((option as { value: unknown }).value)
  return String(option)
}

function optionLabel(option: unknown) {
  if (typeof option === "object" && option !== null && "label" in option) return String((option as { label: unknown }).label)
  return String(option)
}

export function DirectorScalarParameter({ field, value, onChange }: {
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

export function DirectorShotEditor({ field, value, onChange }: {
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
    </div>)}</div> : <p className="director-shot-empty">Add the shots you want Director to follow. Their durations must equal the final video duration.</p>}
  </section>
}
