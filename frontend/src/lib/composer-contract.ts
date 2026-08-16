import type { GeneratePayload, ProductionPart } from "@/types/domain"
import type { VoiceChoice } from "@/lib/voice-options"

export type TextState = "raw" | "shaped" | "tagged"

export type CompositionContext =
  | { kind: "standalone" }
  | {
      kind: "production"
      productionId: number
      partId?: number
      insertion: { kind: "before_part"; partId: string | null } | null
    }

export type RouteSelection =
  | { kind: "owned"; bindingId: string; capabilityId?: string | null }
  | { kind: "catalogue"; catalogueVoiceId: string; capabilityId?: string | null }

export type EditorialBaseline = {
  partId: number
  revision: number
  script: string
}

export type EditorialPatch = {
  script?: string
}

export type ComposerText = {
  raw: string
  shaped: string
  tagged: string
  active: TextState
}

function textState(value: unknown): TextState {
  return value === "shaped" || value === "tagged" ? value : "raw"
}

/**
 * Rebuild the editable recording input from the currently attached Clip.
 * Canonical Part words remain separate; Generate Again starts from the exact
 * immutable input variants used by the active recording whenever they exist.
 */
export function composerTextFromPart(part?: ProductionPart | null): ComposerText {
  if (!part) return { raw: "", shaped: "", tagged: "", active: "raw" }

  const attachedRequest = part.clip_id
    && part.speech_job?.result?.clip_id === part.clip_id
    ? part.speech_job.request
    : null
  const recorded = Boolean(part.clip_id)
  const active = textState(
    attachedRequest?.text_state
      || (recorded ? part.recording_text_state : part.text_state),
  )
  const clipSpoken = String(part.clip_spoken_text || "")
  const clipTagged = String(part.clip_tagged_text || "")
  const historicalShaped = active === "shaped"
    ? clipSpoken
    : active === "tagged" && clipSpoken !== clipTagged
      ? clipSpoken
      : ""
  const states = {
    raw: String(attachedRequest?.text_raw || part.text_raw || (recorded ? part.clip_raw_text : "") || part.text || ""),
    shaped: String(attachedRequest?.text_shaped || part.text_shaped || (recorded ? historicalShaped : "") || ""),
    tagged: String(attachedRequest?.text_tagged || part.text_tagged || (recorded ? clipTagged : "") || ""),
  }
  const selectedText = String(attachedRequest?.text || "")
  if (!states[active] && selectedText) states[active] = selectedText

  return { ...states, active: states[active] ? active : "raw" }
}

export type ComposerDelivery = {
  modeId: string | null
  instruction: string
  rate: number
  pitch: number
  volume: number
  seed: number
}

export type ComposerOutput = { format: GeneratePayload["format"]; language: string }

export type TextReviewReference = {
  jobId: string
  kind: "shape" | "tag"
}

export type ComposerTextPreparation = {
  tagDensity: "none" | "light" | "normal" | "heavy"
  pendingReview: TextReviewReference | null
}

export type CompositionDraft = {
  voiceIdentityId: string | null
  route: RouteSelection | null
  text: ComposerText
  textPreparation: ComposerTextPreparation
  delivery: ComposerDelivery
  output: ComposerOutput
  editorialPatch: EditorialPatch
}

export type RecoverableCompositionDraft = Omit<CompositionDraft, "editorialPatch">

export function recoverableDraft(draft: CompositionDraft): RecoverableCompositionDraft {
  const { editorialPatch: _editorialPatch, ...recoverable } = draft
  return recoverable
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
  text: ComposerText
  delivery: ComposerDelivery
  output: ComposerOutput
  editorialPatch: EditorialPatch
  confirmed: boolean
}

export function compositionContext(input: {
  productionId?: number
  part?: ProductionPart | null
  insertBeforePartId?: string | null
}): CompositionContext {
  if (!input.productionId) return { kind: "standalone" }
  return {
    kind: "production",
    productionId: input.productionId,
    partId: input.part?.id,
    insertion: !input.part
      ? { kind: "before_part", partId: input.insertBeforePartId ?? null }
      : null,
  }
}

export function editorialBaseline(part?: ProductionPart | null): EditorialBaseline | null {
  if (!part) return null
  return {
    partId: part.id,
    revision: part.revision ?? 1,
    script: part.text_raw || part.text || "",
  }
}

export function routeSelection(route: VoiceChoice, capabilityId?: string | null): RouteSelection {
  const selectedCapability = capabilityId || null
  if (route.bindingId) return { kind: "owned", bindingId: route.bindingId, capabilityId: selectedCapability }
  if (route.catalogueVoiceId) return { kind: "catalogue", catalogueVoiceId: route.catalogueVoiceId, capabilityId: selectedCapability }
  throw new Error("That voice option does not contain an exact provider route.")
}

export function routeSelectionFromPart(part?: ProductionPart | null): RouteSelection | null {
  if (!part || !["draft", "speech", "audio"].includes(part.kind)) return null
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
    text: input.draft.text,
    delivery: input.draft.delivery,
    output: input.draft.output,
    editorialPatch: input.draft.editorialPatch,
    confirmed: Boolean(input.confirmed),
  }
}

/** Public speech payload. Route snapshots are resolved and persisted by the server. */
export function toGeneratePayload(command: SpeechGenerationCommand): GeneratePayload {
  const selectedText = command.text[command.text.active] || ""
  const production = command.context.kind === "production" ? command.context : null
  return {
    text: selectedText,
    text_raw: command.text.raw || null,
    text_shaped: command.text.shaped || null,
    text_tagged: command.text.tagged || null,
    text_state: command.text.active,
    ...(production ? { production_id: production.productionId } : {}),
    insert_before_part_id: production?.insertion?.partId ?? null,
    binding_id: command.route.kind === "owned" ? command.route.bindingId : null,
    catalogue_voice_id: command.route.kind === "catalogue" ? command.route.catalogueVoiceId : null,
    capability_id: command.route.capabilityId || null,
    voice_identity_id: command.route.kind === "owned" ? command.voiceIdentityId : null,
    format: command.output.format,
    language: command.output.language || "Auto",
    instruction: command.delivery.instruction,
    speech_mode: command.delivery.modeId || "exact",
    rate: command.delivery.rate,
    pitch: command.delivery.pitch,
    volume: command.delivery.volume,
    seed: command.delivery.seed,
    confirmed: command.confirmed,
  }
}
