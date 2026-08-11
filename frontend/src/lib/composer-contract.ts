import type { GeneratePayload, ProductionPart } from "@/types/domain"
import type { VoiceChoice } from "@/lib/voice-options"

export type TextState = "raw" | "shaped" | "tagged"

export type CompositionContext =
  | { kind: "standalone"; sessionId?: string }
  | {
      kind: "production"
      productionId: number
      operation: "new_part" | "render_draft" | "new_take"
      partId?: number
      insertion: { kind: "legacy_index"; index: number | null } | null
    }

export type RouteSelection =
  | { kind: "owned"; bindingId: string; capabilityId?: string | null }
  | { kind: "catalogue"; catalogueVoiceId: string; capabilityId?: string | null }

export type EditorialBaseline = {
  partId: number
  revision: number
  script: string
  castRoleId: string | null
  selectedTakeId: number | null
}

export type EditorialPatch = {
  script?: string
  castRoleId?: string | null
}

export type ComposerText = {
  raw: string
  shaped: string
  tagged: string
  active: TextState
}

export type ComposerDelivery = {
  mode: "exact" | "directed"
  instruction: string
  rate: number
  pitch: number
  volume: number
  seed: number
}

export type ComposerOutput = { format: string; language: string }

export type CompositionDraft = {
  voiceIdentityId: string | null
  castRoleId: string | null
  route: RouteSelection | null
  text: ComposerText
  delivery: ComposerDelivery
  output: ComposerOutput
  editorialPatch: EditorialPatch
}

export type ComposerUI = {
  section: "script" | "voice" | "delivery" | "output"
  busy: "draft" | "generate" | null
  confirmationEstimate: number | null
}

export type SpeechGenerationCommand = {
  context: CompositionContext
  route: RouteSelection
  voiceIdentityId: string | null
  castRoleId: string | null
  text: ComposerText
  delivery: ComposerDelivery
  output: ComposerOutput
  editorialPatch: EditorialPatch
  confirmed: boolean
}

export function compositionContext(input: {
  productionId?: number
  part?: ProductionPart | null
  insertAt?: number | null
  sessionId?: string
}): CompositionContext {
  if (!input.productionId) return { kind: "standalone", sessionId: input.sessionId }
  const operation = input.part
    ? input.part.kind === "draft" ? "render_draft" : "new_take"
    : "new_part"
  return {
    kind: "production",
    productionId: input.productionId,
    operation,
    partId: input.part?.id,
    insertion: operation === "new_part"
      ? { kind: "legacy_index", index: input.insertAt ?? null }
      : null,
  }
}

export function editorialBaseline(part?: ProductionPart | null): EditorialBaseline | null {
  if (!part) return null
  return {
    partId: part.id,
    revision: part.revision ?? 1,
    script: part.text_raw || part.text || "",
    castRoleId: part.cast_role_id || null,
    selectedTakeId: part.selected_take_id ?? null,
  }
}

export function routeSelection(route: VoiceChoice, capabilityId?: string | null): RouteSelection {
  const selectedCapability = capabilityId || null
  if (route.bindingId) return { kind: "owned", bindingId: route.bindingId, capabilityId: selectedCapability }
  if (route.catalogueVoiceId) return { kind: "catalogue", catalogueVoiceId: route.catalogueVoiceId, capabilityId: selectedCapability }
  throw new Error("That voice option does not contain an exact provider route.")
}

export function routeSelectionFromPersistedDraft(part?: ProductionPart | null): RouteSelection | null {
  if (part?.kind !== "draft") return null
  if (part.binding_id) return { kind: "owned", bindingId: part.binding_id, capabilityId: part.capability_id || null }
  if (part.catalogue_voice_id) return { kind: "catalogue", catalogueVoiceId: part.catalogue_voice_id, capabilityId: part.capability_id || null }
  return null
}

export function routeSelectionId(route: RouteSelection | null) {
  if (!route) return ""
  return route.kind === "owned" ? route.bindingId : route.catalogueVoiceId
}

export function resolveSelectedRoute(selection: RouteSelection | null, routes: VoiceChoice[]) {
  if (!selection) return null
  const id = routeSelectionId(selection)
  const route = routes.find((item) => item.id === id) || null
  if (!route) return null
  const capabilities = route.capabilities
  if (capabilities.length > 1 && !selection.capabilityId) return null
  if (selection.capabilityId && !capabilities.some((item) => item.id === selection.capabilityId)) return null
  return route
}

export function buildSpeechCommand(input: {
  context: CompositionContext
  draft: CompositionDraft
  confirmed?: boolean
}): SpeechGenerationCommand {
  if (!input.draft.route) throw new Error("Choose an exact recording route before generating.")
  return {
    context: input.context,
    route: input.draft.route,
    voiceIdentityId: input.draft.voiceIdentityId,
    castRoleId: input.draft.castRoleId,
    text: input.draft.text,
    delivery: input.draft.delivery,
    output: input.draft.output,
    editorialPatch: input.draft.editorialPatch,
    confirmed: Boolean(input.confirmed),
  }
}

/**
 * Temporary HTTP adapter. The command above is the Composer truth. Provider,
 * engine, model and provider voice labels are derived from the validated exact
 * route only because the existing endpoint still accepts those compatibility
 * fields. They are never used to discover or replace a route.
 */
export function toGeneratePayload(command: SpeechGenerationCommand, route: VoiceChoice): GeneratePayload {
  const routeId = routeSelectionId(command.route)
  if (route.id !== routeId) throw new Error("The selected recording route changed. Choose it again.")
  const selectedText = command.text[command.text.active] || ""
  const production = command.context.kind === "production" ? command.context : null
  return {
    text: selectedText,
    text_raw: command.text.raw || null,
    text_shaped: command.text.shaped || null,
    text_tagged: command.text.tagged || null,
    text_state: command.text.active,
    ...(production ? { production_id: production.productionId } : {}),
    insert_at: production?.insertion?.index ?? null,
    binding_id: command.route.kind === "owned" ? command.route.bindingId : null,
    catalogue_voice_id: command.route.kind === "catalogue" ? command.route.catalogueVoiceId : null,
    capability_id: command.route.capabilityId || null,
    voice_identity_id: command.route.kind === "owned" ? command.voiceIdentityId : null,
    cast_role_id: command.castRoleId,
    format: command.output.format,
    language: command.output.language || "Auto",
    instruction: command.delivery.instruction,
    speech_mode: command.delivery.mode,
    rate: command.delivery.rate,
    pitch: command.delivery.pitch,
    volume: command.delivery.volume,
    seed: command.delivery.seed,
    confirmed: command.confirmed,
    // Compatibility/display fields, derived exclusively from the exact route.
    voice: route.providerVoiceId || "",
    engine: route.engine,
    model: route.model,
  }
}
