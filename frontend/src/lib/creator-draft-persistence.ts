import { DEFAULT_RECORDING_VOLUME, type CompositionContext, type RecoverableCompositionDraft, type RouteSelection } from "@/lib/creator-contract"

export type CreatorDraftRecord = {
  id: string
  state: RecoverableCompositionDraft
  version: number
  updatedAt: string
}

export type CreatorDraftWireRecord = {
  id: string
  state: {
    authored_role?: string | null
    voice_identity_id: string | null
    route: { kind: "owned" | "catalogue"; binding_id: string | null; catalogue_voice_id: string | null; capability_id: string | null } | null
    text: RecoverableCompositionDraft["text"]
    text_preparation: { tag_density: RecoverableCompositionDraft["textPreparation"]["tagDensity"]; spoken_profile: RecoverableCompositionDraft["textPreparation"]["spokenProfile"]; pending_review: { job_id: string; kind: "shape" | "tag"; spoken_profile?: RecoverableCompositionDraft["textPreparation"]["spokenProfile"] | null } | null }
    delivery: { mode_id: string | null; instruction: string; rate: number; pitch: number; volume: number; seed: number; enable_ssml?: boolean }
    output: RecoverableCompositionDraft["output"]
  }
  version: number
  updated_at: string
}

export function contextWire(context: CompositionContext) {
  if (context.kind === "standalone") {
    return { kind: "standalone" as const }
  }
  return {
    kind: "production" as const,
    production_id: context.productionId,
    part_id: context.partId ?? null,
    insert_before_part_id: context.insertion?.partId ?? null,
  }
}

function routeWire(route: RouteSelection | null) {
  if (!route) return null
  return {
    kind: route.kind,
    binding_id: route.kind === "owned" ? route.bindingId : null,
    catalogue_voice_id: route.kind === "catalogue" ? route.catalogueVoiceId : null,
    capability_id: route.capabilityId || null,
  }
}

function routeFromWire(route: CreatorDraftWireRecord["state"]["route"]): RouteSelection | null {
  if (!route) return null
  if (route.kind === "owned" && route.binding_id) return { kind: "owned", bindingId: route.binding_id, capabilityId: route.capability_id }
  if (route.kind === "catalogue" && route.catalogue_voice_id) return { kind: "catalogue", catalogueVoiceId: route.catalogue_voice_id, capabilityId: route.capability_id }
  return null
}

export function draftWire(draft: RecoverableCompositionDraft): CreatorDraftWireRecord["state"] {
  return {
    authored_role: draft.authoredRole?.trim().replace(/\s+/g, " ") || null,
    voice_identity_id: draft.voiceIdentityId,
    route: routeWire(draft.route),
    text: draft.text,
    text_preparation: {
      tag_density: draft.textPreparation.tagDensity,
      spoken_profile: draft.textPreparation.spokenProfile,
      pending_review: draft.textPreparation.pendingReview
        ? { job_id: draft.textPreparation.pendingReview.jobId, kind: draft.textPreparation.pendingReview.kind, spoken_profile: draft.textPreparation.pendingReview.spokenProfile }
        : null,
    },
    delivery: {
      mode_id: draft.delivery.modeId,
      instruction: draft.delivery.instruction,
      rate: draft.delivery.rate,
      pitch: draft.delivery.pitch,
      volume: draft.delivery.volume,
      seed: draft.delivery.seed,
      enable_ssml: draft.delivery.enableSsml,
    },
    output: draft.output,
  }
}

export function draftFromWire(record: CreatorDraftWireRecord): CreatorDraftRecord {
  return {
    id: record.id,
    version: record.version,
    updatedAt: record.updated_at,
    state: {
      authoredRole: record.state.authored_role || "",
      voiceIdentityId: record.state.voice_identity_id,
      route: routeFromWire(record.state.route),
      text: record.state.text,
      textPreparation: {
        tagDensity: record.state.text_preparation.tag_density,
        spokenProfile: record.state.text_preparation.spoken_profile || "spoken_1",
        pendingReview: record.state.text_preparation.pending_review
          ? { jobId: record.state.text_preparation.pending_review.job_id, kind: record.state.text_preparation.pending_review.kind, spokenProfile: record.state.text_preparation.pending_review.spoken_profile }
          : null,
      },
      delivery: {
        modeId: record.state.delivery.mode_id,
        instruction: record.state.delivery.instruction,
        rate: record.state.delivery.rate,
        pitch: record.state.delivery.pitch,
        volume: record.state.delivery.volume,
        seed: record.state.delivery.seed,
        enableSsml: Boolean(record.state.delivery.enable_ssml),
      },
      output: record.state.output,
    },
  }
}

export function meaningfulDraft(draft: RecoverableCompositionDraft) {
  return Boolean(
    draft.authoredRole || draft.voiceIdentityId || draft.route
    || draft.text.raw || draft.text.shaped || draft.text.tagged
    || draft.textPreparation.pendingReview || draft.textPreparation.tagDensity !== "normal"
    || draft.textPreparation.spokenProfile !== "spoken_1"
    || draft.delivery.instruction || draft.delivery.modeId
    || draft.delivery.rate !== 1 || draft.delivery.pitch !== 1
    || draft.delivery.volume !== DEFAULT_RECORDING_VOLUME || draft.delivery.seed || draft.delivery.enableSsml
    || draft.output.language !== "Auto" || draft.output.format !== "mp3"
  )
}
