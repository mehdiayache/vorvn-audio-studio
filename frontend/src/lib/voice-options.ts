import type { VoiceModelSummary, VoiceProfile, VoiceRegistry } from "@/types/domain"

export type SpeechEngine = "audio" | "omni" | "qwen_tts"
export type SpeechModel = "plus" | "flash" | "vc"

export type VoiceChoice = {
  id: string
  identityId: string
  name: string
  description: string
  source: "mine" | "alibaba"
  engine: SpeechEngine
  model: SpeechModel
  modelId: string
  compatible: boolean
  languages: string[]
  status: string
}

export type VoiceIdentityChoice = {
  identityId: string
  name: string
  description: string
  source: "mine" | "alibaba"
  editorialLanguage: string
  routes: VoiceChoice[]
}

// A provider binding is castable only after Alibaba has confirmed it.  Keep
// this as a positive list: a new job/interruption status must never become a
// selectable voice route by accident.
const readyStatuses = new Set(["active", "ready"])

function toChoice(binding: VoiceRegistry["bindings"][number]): VoiceChoice {
  return {
    id: binding.provider_voice_id,
    identityId: binding.identity_id,
    name: binding.name,
    description: binding.description,
    source: binding.source === "custom" ? "mine" : "alibaba",
    engine: binding.engine,
    model: binding.tier,
    modelId: binding.model_id,
    compatible: readyStatuses.has(binding.status.toLocaleLowerCase()),
    languages: binding.languages,
    status: binding.status,
  }
}

export function getVoiceIdentities(registry: VoiceRegistry | null, profiles: VoiceProfile[] = []) {
  if (!registry) return [] as VoiceIdentityChoice[]
  const grouped = new Map<string, VoiceChoice[]>()
  for (const binding of registry.bindings) {
    const choice = toChoice(binding)
    if (!choice.compatible) continue
    const routes = grouped.get(choice.identityId) || []
    routes.push(choice)
    grouped.set(choice.identityId, routes)
  }
  return [...grouped.entries()].map(([identityId, routes]) => {
    const first = routes[0]!
    const profile = profiles.find((item) => item.id === identityId)
    return {
      identityId,
      name: profile?.name || first.name,
      description: String(profile?.metadata.trait || first.description),
      source: first.source,
      editorialLanguage: first.source === "mine"
        ? String(profile?.metadata.editorial_language || "")
        : "",
      routes,
    }
  }).sort((left, right) => {
    if (left.source !== right.source) return left.source === "mine" ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

export function routesForIdentity(
  identity: VoiceIdentityChoice | undefined,
  _language: string,
) {
  // Published language coverage is guidance, never a casting gate. A ready
  // binding stays selectable and the provider remains the final authority.
  return (identity?.routes || []).filter((route) => route.compatible)
}

export function chooseIdentityRoute(
  routes: VoiceChoice[],
  preferred?: { engine?: SpeechEngine; model?: SpeechModel },
) {
  if (!routes.length) return undefined
  const exact = routes.find(
    (route) => route.engine === preferred?.engine
      && route.model === preferred?.model,
  )
  if (exact) return exact
  const sameEngine = routes.find((route) => route.engine === preferred?.engine)
  if (sameEngine) return sameEngine
  return routes.find((route) => route.engine === "audio")
    || routes.find((route) => route.engine === "qwen_tts")
    || routes.find((route) => route.engine === "omni" && route.model === "plus")
    || routes[0]
}

export function getVoiceOptions(registry: VoiceRegistry | null, engine: SpeechEngine, model: SpeechModel) {
  if (!registry) return { choices: [] as VoiceChoice[], compatible: [] as VoiceChoice[], summary: null as VoiceModelSummary | null }
  const choices = registry.bindings.map((binding): VoiceChoice => {
    const choice = toChoice(binding)
    return {
      ...choice,
      compatible: choice.compatible
        && binding.engine === engine && binding.tier === model,
    }
  })
  const summary = registry.models.find((item) => item.engine === engine && item.tier === model) || null
  return { choices, compatible: choices.filter((choice) => choice.compatible), summary }
}
