import type { SoundPresetTaxonomy, SoundPresetTaxonomyItem } from "@/types/domain"

export type PresetCapability = "music" | "sfx"
export type SemanticValue = string | {
  display: string
  canonical_en: string
  source: "custom"
}
export type PresetInstrument = { id: SemanticValue; modifiers: SemanticValue[] }
export type SoundPreset = Record<string, unknown> & {
  model_type: PresetCapability
  creative_brief: string
  duration: number
  seed: number
  variation_count: 1 | 2 | 4
  conflict_resolutions: Record<string, "structured" | "brief">
}

export type TaxonomyItem = SoundPresetTaxonomyItem & {
  id: string
  category: string
  labels: Record<string, string>
  help: {
    definition_en: string
    audible_effect_en: string
    use_when_en: string
  }
  prompt_en: string
  aliases: string[]
  suggestion_contexts: string[]
}

export function taxonomyLabel(item: TaxonomyItem) {
  return item.labels.en || item.id
}

export function emptySoundPreset(capability: PresetCapability): SoundPreset {
  if (capability === "music") return {
    model_type: "music", creative_brief: "", context: [], cue_role: [], moment: [],
    voice_relationship: null, speech_presence: null, moods: [], energy: null,
    tension: null, emotional_arc: null, genres: [], era_context: [],
    harmonic_feel: [], pace: null, exact_bpm: null, rhythm_groove: [],
    instruments: [], arrangement: {
      density: null, melody_prominence: null, rhythmic_activity: null,
      percussion_presence: null, dynamics: null, evolution: null,
      harmonic_movement: null, phrase_space: null, low_end_weight: null,
    }, production: { characters: [], palette: null, tone: null, space: [], recording_character: [] },
    cue_behaviour: { ending: null, loop_intention: null }, constraints: [],
    duration: 30, seed: -1, variation_count: 1, conflict_resolutions: {},
  }
  return {
    model_type: "sfx", creative_brief: "", family: [], source: [], material: [],
    action: [], motion: null, perspective: null, environment: [], intensity: null,
    envelope: [], character: [], processing: [], realism: null, behaviour: null,
    constraints: [], duration: 5, seed: -1, variation_count: 1,
    conflict_resolutions: {},
  }
}

export function taxonomyItems(snapshot: SoundPresetTaxonomy | null): TaxonomyItem[] {
  return (snapshot?.items || []) as TaxonomyItem[]
}

export function valueId(value: SemanticValue | null | undefined) {
  return typeof value === "string" ? value : value?.canonical_en || ""
}

export function valueLabel(value: SemanticValue, items: TaxonomyItem[]) {
  if (typeof value !== "string") return value.display
  return items.find((item) => item.id === value)?.labels.en || value
}

export function selectionLabels(value: unknown, items: TaxonomyItem[]) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.map((item) => valueLabel(item as SemanticValue, items))
}

export function categoryItems(items: TaxonomyItem[], category: string) {
  return items.filter((item) => item.category === category)
}

export function updatePresetPath(preset: SoundPreset, path: string, value: unknown): SoundPreset {
  const [group, field] = path.split(".")
  if (!group) return preset
  if (!field) return { ...preset, [group]: value }
  const current = preset[group]
  return { ...preset, [group]: { ...(typeof current === "object" && current ? current : {}), [field]: value } }
}

export function presetPath(preset: SoundPreset, path: string): unknown {
  const [group, field] = path.split(".")
  if (!group) return undefined
  if (!field) return preset[group]
  const current = preset[group]
  return typeof current === "object" && current ? (current as Record<string, unknown>)[field] : undefined
}

export function inferKnownSelections(preset: SoundPreset, items: TaxonomyItem[]): SoundPreset {
  const text = preset.creative_brief.toLocaleLowerCase()
  if (!text.trim()) return preset
  const matching = (category: string) => categoryItems(items, category).filter((item) => {
    const terms = [taxonomyLabel(item), ...(item.aliases || [])]
    return terms.some((term) => term.length >= 4 && text.includes(term.toLocaleLowerCase()))
  }).map((item) => item.id)
  if (preset.model_type === "sfx") return {
    ...preset,
    family: (preset.family as SemanticValue[]).length ? preset.family : matching("sfx_family"),
    material: (preset.material as SemanticValue[]).length ? preset.material : matching("sfx_material"),
    action: (preset.action as SemanticValue[]).length ? preset.action : matching("sfx_action"),
    environment: (preset.environment as SemanticValue[]).length ? preset.environment : matching("sfx_environment"),
    character: (preset.character as SemanticValue[]).length ? preset.character : matching("sfx_character"),
  }
  return {
    ...preset,
    context: (preset.context as SemanticValue[]).length ? preset.context : matching("context"),
    cue_role: (preset.cue_role as SemanticValue[]).length ? preset.cue_role : matching("cue_role"),
    moment: (preset.moment as SemanticValue[]).length ? preset.moment : matching("moment"),
    moods: (preset.moods as SemanticValue[]).length ? preset.moods : matching("mood"),
    genres: (preset.genres as SemanticValue[]).length ? preset.genres : matching("genre"),
    instruments: (preset.instruments as PresetInstrument[]).length ? preset.instruments : matching("instrument").map((id) => ({ id, modifiers: [] })),
  }
}

export function presetSummary(preset: SoundPreset, items: TaxonomyItem[]) {
  const result: { label: string; values: string[] }[] = []
  const add = (label: string, path: string) => {
    const values = selectionLabels(presetPath(preset, path), items)
    if (values.length) result.push({ label, values })
  }
  if (preset.model_type === "music") {
    add("Use", "context"); add("Role", "cue_role"); add("Moment", "moment")
    add("Voice", "voice_relationship"); add("Feeling", "moods")
    add("Energy", "energy"); add("Style", "genres"); add("Harmony", "harmonic_feel")
    const instruments = (preset.instruments as PresetInstrument[]).map((item) => valueLabel(item.id, items))
    if (instruments.length) result.push({ label: "Instruments", values: instruments })
    add("Density", "arrangement.density"); add("Melody", "arrangement.melody_prominence")
    add("Sound", "production.characters"); add("Workspace", "production.space")
    add("Ending", "cue_behaviour.ending")
  } else {
    add("Family", "family"); add("Source", "source"); add("Action", "action")
    add("Material", "material"); add("Perspective", "perspective")
    add("Place", "environment"); add("Character", "character")
    add("Behaviour", "behaviour")
  }
  return result
}
