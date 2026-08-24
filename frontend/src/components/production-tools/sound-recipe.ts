import type { SoundRecipeTaxonomy, SoundRecipeTaxonomyItem } from "@/types/domain"

export type RecipeCapability = "music" | "sfx"
export type SemanticValue = string | {
  display: string
  canonical_en: string
  source: "custom"
}
export type RecipeInstrument = { id: SemanticValue; modifiers: SemanticValue[] }
export type SoundRecipe = Record<string, unknown> & {
  model_type: RecipeCapability
  creative_brief: string
  duration: number
  seed: number
  variation_count: 1 | 2 | 4
  conflict_resolutions: Record<string, "structured" | "brief">
}

export type TaxonomyItem = SoundRecipeTaxonomyItem & {
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

export function emptySoundRecipe(capability: RecipeCapability): SoundRecipe {
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

export function taxonomyItems(snapshot: SoundRecipeTaxonomy | null): TaxonomyItem[] {
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

export function updateRecipePath(recipe: SoundRecipe, path: string, value: unknown): SoundRecipe {
  const [group, field] = path.split(".")
  if (!group) return recipe
  if (!field) return { ...recipe, [group]: value }
  const current = recipe[group]
  return { ...recipe, [group]: { ...(typeof current === "object" && current ? current : {}), [field]: value } }
}

export function recipePath(recipe: SoundRecipe, path: string): unknown {
  const [group, field] = path.split(".")
  if (!group) return undefined
  if (!field) return recipe[group]
  const current = recipe[group]
  return typeof current === "object" && current ? (current as Record<string, unknown>)[field] : undefined
}

export function inferKnownSelections(recipe: SoundRecipe, items: TaxonomyItem[]): SoundRecipe {
  const text = recipe.creative_brief.toLocaleLowerCase()
  if (!text.trim()) return recipe
  const matching = (category: string) => categoryItems(items, category).filter((item) => {
    const terms = [taxonomyLabel(item), ...(item.aliases || [])]
    return terms.some((term) => term.length >= 4 && text.includes(term.toLocaleLowerCase()))
  }).map((item) => item.id)
  if (recipe.model_type === "sfx") return {
    ...recipe,
    family: (recipe.family as SemanticValue[]).length ? recipe.family : matching("sfx_family"),
    material: (recipe.material as SemanticValue[]).length ? recipe.material : matching("sfx_material"),
    action: (recipe.action as SemanticValue[]).length ? recipe.action : matching("sfx_action"),
    environment: (recipe.environment as SemanticValue[]).length ? recipe.environment : matching("sfx_environment"),
    character: (recipe.character as SemanticValue[]).length ? recipe.character : matching("sfx_character"),
  }
  return {
    ...recipe,
    context: (recipe.context as SemanticValue[]).length ? recipe.context : matching("context"),
    cue_role: (recipe.cue_role as SemanticValue[]).length ? recipe.cue_role : matching("cue_role"),
    moment: (recipe.moment as SemanticValue[]).length ? recipe.moment : matching("moment"),
    moods: (recipe.moods as SemanticValue[]).length ? recipe.moods : matching("mood"),
    genres: (recipe.genres as SemanticValue[]).length ? recipe.genres : matching("genre"),
    instruments: (recipe.instruments as RecipeInstrument[]).length ? recipe.instruments : matching("instrument").map((id) => ({ id, modifiers: [] })),
  }
}

export function recipeSummary(recipe: SoundRecipe, items: TaxonomyItem[]) {
  const result: { label: string; values: string[] }[] = []
  const add = (label: string, path: string) => {
    const values = selectionLabels(recipePath(recipe, path), items)
    if (values.length) result.push({ label, values })
  }
  if (recipe.model_type === "music") {
    add("Use", "context"); add("Role", "cue_role"); add("Moment", "moment")
    add("Voice", "voice_relationship"); add("Feeling", "moods")
    add("Energy", "energy"); add("Style", "genres"); add("Harmony", "harmonic_feel")
    const instruments = (recipe.instruments as RecipeInstrument[]).map((item) => valueLabel(item.id, items))
    if (instruments.length) result.push({ label: "Instruments", values: instruments })
    add("Density", "arrangement.density"); add("Melody", "arrangement.melody_prominence")
    add("Sound", "production.characters"); add("Space", "production.space")
    add("Ending", "cue_behaviour.ending")
  } else {
    add("Family", "family"); add("Source", "source"); add("Action", "action")
    add("Material", "material"); add("Perspective", "perspective")
    add("Place", "environment"); add("Character", "character")
    add("Behaviour", "behaviour")
  }
  return result
}
