import { Check, CircleHelp, Plus, Search, X } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

import { categoryItems, taxonomyLabel, valueId, valueLabel, type SemanticValue, type TaxonomyItem } from "@/features/composer/audio/sound-preset"

export function PresetField({ label, help, children }: {
  label: string
  help?: string
  children: ReactNode
}) {
  return <section className="preset-field">
    <header><b>{label}</b>{help && <OperatorTooltip label={label} detail={help}><button type="button" className="preset-help" aria-label={`Learn about ${label}`}><CircleHelp /></button></OperatorTooltip>}</header>
    {children}
  </section>
}

export function TaxonomyPicker({ items, category, value, onChange, multiple = true, suggestions, label, custom = true }: {
  items: TaxonomyItem[]
  category: string
  value: SemanticValue[]
  onChange: (value: SemanticValue[]) => void
  multiple?: boolean
  suggestions?: string[]
  label: string
  custom?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const options = categoryItems(items, category)
  const suggested = useMemo(() => {
    const preferred = (suggestions || []).map((id) => options.find((item) => item.id === id)).filter(Boolean) as TaxonomyItem[]
    return preferred.length ? preferred : options.slice(0, 8)
  }, [options, suggestions])
  const selected = new Set(value.map(valueId))
  const toggle = (next: SemanticValue) => {
    const id = valueId(next)
    if (selected.has(id)) onChange(value.filter((item) => valueId(item) !== id))
    else onChange(multiple ? [...value, next] : [next])
  }
  const normalizedQuery = query.trim()
  const exact = options.some((item) => taxonomyLabel(item).toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase())
  return <div className="preset-picker">
    <div className="preset-choice-row">{suggested.map((item) => <PresetChoice key={item.id} item={item} active={selected.has(item.id)} onClick={() => toggle(item.id)} />)}</div>
    {value.some((item) => !suggested.some((option) => option.id === valueId(item))) && <div className="preset-selected-extra">{value.filter((item) => !suggested.some((option) => option.id === valueId(item))).map((item) => <button type="button" key={valueId(item)} onClick={() => toggle(item)}><span>{valueLabel(item, items)}</span><X /></button>)}</div>}
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" size="sm"><Search />Browse all {label.toLocaleLowerCase()}</Button></PopoverTrigger><PopoverContent className="preset-picker-popover" align="start"><Command shouldFilter><CommandInput value={query} onValueChange={setQuery} placeholder={`Search ${label.toLocaleLowerCase()}…`} /><CommandList><CommandEmpty>{custom && normalizedQuery && !exact ? <button type="button" className="preset-add-custom" onClick={() => { toggle({ display: normalizedQuery, canonical_en: normalizedQuery, source: "custom" }); setOpen(false); setQuery("") }}><Plus />Add “{normalizedQuery}”</button> : `No matching ${label.toLocaleLowerCase()}.`}</CommandEmpty><CommandGroup>{options.map((item) => { const itemLabel = taxonomyLabel(item); return <CommandItem key={item.id} value={`${itemLabel} ${item.aliases.join(" ")}`} onSelect={() => toggle(item.id)}><span className={cn("preset-command-check", selected.has(item.id) && "is-active")}><Check /></span><span>{itemLabel}</span><OperatorTooltip label={itemLabel} detail={`${item.help.definition_en} ${item.help.audible_effect_en}`}><button type="button" className="preset-help" aria-label={`Learn about ${itemLabel}`} onClick={(event) => event.stopPropagation()}><CircleHelp /></button></OperatorTooltip></CommandItem> })}</CommandGroup></CommandList></Command></PopoverContent></Popover>
  </div>
}

function PresetChoice({ item, active, onClick }: { item: TaxonomyItem; active: boolean; onClick: () => void }) {
  const label = taxonomyLabel(item)
  return <div className={cn("preset-choice", active && "is-active")}>
    <button type="button" aria-pressed={active} onClick={onClick}><span>{label}</span>{active && <Check />}</button>
    <OperatorTooltip label={label} detail={`${item.help.definition_en} ${item.help.audible_effect_en} ${item.help.use_when_en}`} side="bottom"><button type="button" className="preset-help" aria-label={`Learn about ${label}`}><CircleHelp /></button></OperatorTooltip>
  </div>
}

export function SemanticScale({ label, items, values, value, onChange, help }: {
  label: string
  items: TaxonomyItem[]
  values: string[]
  value: string | null
  onChange: (value: string) => void
  help: string
}) {
  const selectedIndex = Math.max(0, values.indexOf(value || values[0] || ""))
  const selected = items.find((item) => item.id === values[selectedIndex])
  return <PresetField label={label} help={help}><div className="preset-scale">
    <div><b>{selected?.labels.en || "Not decided"}</b><small>{selected?.help.audible_effect_en}</small></div>
    <Slider aria-label={label} min={0} max={values.length - 1} step={1} value={[selectedIndex]} onValueChange={(indices) => { const next = values[indices[0] ?? -1]; if (next) onChange(next) }} />
    <div className="preset-scale-ends"><span>{items.find((item) => item.id === values[0])?.labels.en}</span><span>{items.find((item) => item.id === values.at(-1))?.labels.en}</span></div>
  </div></PresetField>
}

export function SingleChoice({ items, category, value, onChange, suggestions, label }: {
  items: TaxonomyItem[]
  category: string
  value: SemanticValue | null
  onChange: (value: SemanticValue | null) => void
  suggestions?: string[]
  label: string
}) {
  return <TaxonomyPicker items={items} category={category} value={value ? [value] : []} onChange={(next) => onChange(next[0] || null)} multiple={false} suggestions={suggestions} label={label} />
}
