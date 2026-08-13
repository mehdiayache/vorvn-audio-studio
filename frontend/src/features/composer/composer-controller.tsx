import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useComposerDraftRecovery } from "@/hooks/use-composer-draft-recovery"
import { useComposerText } from "@/hooks/use-composer-text"
import {
  buildSpeechCommand,
  compositionContext,
  editorialBaseline,
  recoverableDraft,
  resolveSelectedRoute,
  routeSelection,
  routeSelectionFromPersistedDraft,
  routeSelectionId,
  toGeneratePayload,
  type ComposerText,
  type CompositionDraft,
  type SpeechGenerationCommand,
  type TextReviewReference,
} from "@/lib/composer-contract"
import { composerCapabilityControls, resolvedDeliveryMode, selectedRouteCapability } from "@/lib/composer-capability"
import { outputLanguageOptions } from "@/lib/voice-capabilities"
import { getVoiceIdentities, routesForIdentity, type VoiceChoice, type VoiceIdentityChoice } from "@/lib/voice-options"
import type { DurableJob, GeneratePayload, GenerateResult, PlayerSource, ProductionCastRole, ProductionPart, StudioConfig, VoiceDirectory } from "@/types/domain"

export type ComposerSurfaceProps = {
  productionId?: number
  sessionId?: string
  nextPartNumber?: number
  insertAt?: number | null
  insertBeforePartId?: string | null
  part?: ProductionPart | null
  config: StudioConfig | null
  directory: VoiceDirectory
  cast?: ProductionCastRole[]
  playingKey?: string
  playerPlaying: boolean
  onSave?: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial?: (values: { expected_revision: number; script?: string; cast_role_id?: string | null }) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onPlay: (source: PlayerSource) => void
  /** Visual hosts may hide the Composer without unmounting it. */
  visible?: boolean
}

export function routesAllowedForCastRole(routes: VoiceChoice[], role?: ProductionCastRole) {
  if (role?.voice_source_kind !== "catalogue" || !role.catalogue_voice_id) return routes
  return routes.filter((route) => route.catalogueVoiceId === role.catalogue_voice_id)
}

type PendingGeneration = {
  command: SpeechGenerationCommand
  updateEditorial: boolean
}

export function useComposerController({ productionId, sessionId, nextPartNumber = 1, insertAt = null, insertBeforePartId = null, part = null, config, directory, cast = [], playingKey, playerPlaying, onSave, onUpdateEditorial, onGenerate, onPlay, visible = true }: ComposerSurfaceProps) {
  const [route, setRoute] = useState(routeSelectionFromPersistedDraft(part))
  const [identityId, setIdentityId] = useState(part?.voice_identity_id || "")
  const [castRoleId, setCastRoleId] = useState(part?.cast_role_id || "")
  const [language, setLanguage] = useState(part?.language || "Auto")
  const [format, setFormat] = useState<GeneratePayload["format"]>((part?.format as GeneratePayload["format"]) || "mp3")
  const [deliveryModeRequest, setDeliveryModeRequest] = useState<string>(part?.speech_mode || "exact")
  const [instruction, setInstruction] = useState(part?.instruction || "")
  const [rate, setRate] = useState(part?.rate ?? 1)
  const [pitch, setPitch] = useState(part?.pitch ?? 1)
  const [volume, setVolume] = useState(part?.volume ?? 50)
  const [busy, setBusy] = useState<"draft" | "generate" | null>(null)
  const [confirmationEstimate, setConfirmationEstimate] = useState<number | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingGeneration | null>(null)
  const [editorialCommand, setEditorialCommand] = useState<SpeechGenerationCommand | null>(null)
  const [textReviewReference, setTextReviewReference] = useState<TextReviewReference | null>(null)
  const persistTextPreparationRef = useRef<(reference: TextReviewReference | null, text?: ComposerText) => Promise<void>>(async () => undefined)

  useEffect(() => {
    setBusy(null)
    setConfirmationEstimate(null)
    setPendingCommand(null)
    setEditorialCommand(null)
    setTextReviewReference(null)
    setRoute(routeSelectionFromPersistedDraft(part))
    setIdentityId(part?.voice_identity_id || "")
    setCastRoleId(part?.cast_role_id || "")
    setLanguage(part?.language || "Auto")
    setFormat((part?.format as GeneratePayload["format"]) || "mp3")
    setDeliveryModeRequest(part?.speech_mode || "exact")
    setInstruction(part?.instruction || "")
    setRate(part?.rate ?? 1)
    setPitch(part?.pitch ?? 1)
    setVolume(part?.volume ?? 50)
  }, [part?.id])

  const identities = useMemo(
    () => getVoiceIdentities(directory.registry ?? null, directory.identities),
    [directory.identities, directory.registry],
  )
  const selectedIdentity = identities.find((identity) => identity.identityId === identityId)
  const selectedCastRole = cast.find((item) => item.id === castRoleId)
  const compatibleRoutes = useMemo(() => {
    const routes = routesForIdentity(selectedIdentity, language)
    return routesAllowedForCastRole(routes, selectedCastRole)
  }, [language, selectedCastRole?.catalogue_voice_id, selectedCastRole?.voice_source_kind, selectedIdentity])
  const visibleRoutes = selectedCastRole?.voice_source_kind === "catalogue" ? compatibleRoutes : selectedIdentity?.routes || []
  const selectedRoute = selectedIdentity?.routes.find((item) => item.id === routeSelectionId(route))
  const currentRoute = resolveSelectedRoute(route, compatibleRoutes)
  const selectedCapability = selectedRouteCapability(currentRoute, route?.capabilityId)
  const capabilityControls = composerCapabilityControls(selectedCapability)
  const deliveryMode = resolvedDeliveryMode(capabilityControls, deliveryModeRequest)
  const textSession = useComposerText(part, productionId, selectedCapability?.id || null, {
    reviewReference: textReviewReference,
    onReviewReferenceChange: async (reference, nextText) => {
      setTextReviewReference(reference)
      await persistTextPreparationRef.current(reference, nextText)
    },
  })
  const languageOptions = outputLanguageOptions(config, selectedIdentity)

  function applyRoute(nextRoute: VoiceChoice | undefined, capabilityId?: string | null) {
    setRoute(nextRoute ? routeSelection(nextRoute, capabilityId) : null)
  }

  function selectIdentity(identity: VoiceIdentityChoice) {
    setIdentityId(identity.identityId)
    setRoute(null)
    const role = cast.find((item) => item.id === castRoleId)
    const matchesIdentity = role?.voice_identity_id === identity.identityId
    const matchesCatalogue = Boolean(role?.catalogue_voice_id && identity.routes.some((item) => item.catalogueVoiceId === role.catalogue_voice_id))
    if (role && !matchesIdentity && !matchesCatalogue) setCastRoleId("")
  }

  function selectCastRole(roleId: string) {
    setCastRoleId(roleId === "none" ? "" : roleId)
    const role = cast.find((item) => item.id === roleId)
    if (!role) return
    if (role.voice_identity_id) {
      setIdentityId(role.voice_identity_id)
      setRoute(null)
      return
    }
    if (role.catalogue_voice_id) {
      const identity = identities.find((item) => item.routes.some((candidate) => candidate.catalogueVoiceId === role.catalogue_voice_id))
      if (identity) {
        setIdentityId(identity.identityId)
        setRoute(null)
      }
    }
  }

  useEffect(() => {
    if (!identities.length) return
    const exactBinding = part?.binding_id || part?.catalogue_voice_id
      ? directory.registry?.bindings.find((item) => Boolean(part.binding_id && item.binding_id === part.binding_id) || Boolean(part.catalogue_voice_id && item.catalogue_voice_id === part.catalogue_voice_id))
      : undefined
    if (!identityId || !selectedIdentity) {
      const explicit = identities.find((item) => item.identityId === (part?.voice_identity_id || exactBinding?.identity_id))
      if (explicit) setIdentityId(explicit.identityId)
      return
    }
    if (!selectedRoute) setRoute(null)
  }, [directory.registry?.bindings, identities, identityId, part?.binding_id, part?.catalogue_voice_id, part?.voice_identity_id, selectedIdentity, selectedRoute])

  const documentedTags = useMemo(() => new Set([
    ...Object.values(config?.tags || {}).flatMap((group) => Array.isArray(group) ? group : Object.keys(group)),
    ...(Array.isArray(config?.retired_tags) ? config.retired_tags : Object.keys(config?.retired_tags || {})),
  ].map((tag) => tag.toLocaleLowerCase())), [config?.retired_tags, config?.tags])
  const hasInlineDeliveryTag = Array.from(textSession.text.matchAll(/\[([^\[\]]{1,40})\]/g))
    .some((match) => documentedTags.has((match[1] || "").toLocaleLowerCase()))
  const taggedIncompatible = Boolean(currentRoute) && !capabilityControls.deliveryTags && (textSession.view === "tagged" || hasInlineDeliveryTag)
  const removeInlineTags = () => textSession.updateText(textSession.text.replace(/\[([^\[\]]{1,40})\]\s*/g, (match, tag: string) => documentedTags.has(tag.toLocaleLowerCase()) ? "" : match))
  const estimate = textSession.text.length * Number(currentRoute?.estimateRatePerMillionCharacters || 0) / 1_000_000
  const textPassEstimate = textSession.text.length * Number(config?.text_preparation?.estimated_price_per_million_characters || 0) / 1_000_000
  const destination = !productionId
    ? "Standalone recording"
    : part
      ? part.kind === "draft" ? `Record draft · Part ${(part.position ?? 0) + 1}` : `Replace recording · Part ${(part.position ?? 0) + 1}`
      : insertAt === null ? `New speech · Part ${nextPartNumber}` : `New speech · before Part ${insertAt + 1}`
  const context = useMemo(() => compositionContext({ productionId, part, insertAt, insertBeforePartId, sessionId }), [insertAt, insertBeforePartId, part, productionId, sessionId])
  const baseline = useMemo(() => editorialBaseline(part), [part])
  const draft: CompositionDraft = {
    voiceIdentityId: selectedIdentity?.source === "owned" ? selectedIdentity.identityId : null,
    castRoleId: castRoleId || null,
    route,
    text: { raw: textSession.states.raw, shaped: textSession.states.shaped, tagged: textSession.states.tagged, active: textSession.view },
    textPreparation: { tagDensity: textSession.density, pendingReview: textReviewReference },
    delivery: { modeId: deliveryMode, instruction: capabilityControls.naturalDirection ? instruction : "", rate, pitch, volume, seed: part?.seed ?? 0 },
    output: { format, language: language || "Auto" },
    editorialPatch: {
      ...(baseline && textSession.states.raw !== baseline.script ? { script: textSession.states.raw } : {}),
      ...(baseline && (castRoleId || null) !== baseline.castRoleId ? { castRoleId: castRoleId || null } : {}),
    },
  }
  const latestRecoverableDraftRef = useRef(recoverableDraft(draft))
  latestRecoverableDraftRef.current = recoverableDraft(draft)
  const recovery = useComposerDraftRecovery({
    context,
    draft: recoverableDraft(draft),
    onRestore: (saved) => {
      setIdentityId(saved.voiceIdentityId || "")
      setCastRoleId(saved.castRoleId || "")
      setRoute(saved.route)
      setTextReviewReference(saved.textPreparation.pendingReview)
      textSession.restore(saved.text, saved.textPreparation.tagDensity)
      setDeliveryModeRequest(saved.delivery.modeId || "exact")
      setInstruction(saved.delivery.instruction)
      setRate(saved.delivery.rate)
      setPitch(saved.delivery.pitch)
      setVolume(saved.delivery.volume)
      setFormat(saved.output.format)
      setLanguage(saved.output.language)
    },
    enabled: context.kind === "production" || Boolean(context.sessionId),
  })
  persistTextPreparationRef.current = async (reference, nextText) => {
    const current = latestRecoverableDraftRef.current
    const next = { ...current, text: nextText || current.text, textPreparation: { tagDensity: textSession.density, pendingReview: reference } }
    latestRecoverableDraftRef.current = next
    await recovery.saveNow(next)
  }
  const previousVisibleRef = useRef(visible)
  useEffect(() => {
    if (previousVisibleRef.current && !visible) {
      // Collapsing keeps the Composer mounted, so the unmount flush cannot
      // protect the last sub-700ms edit. Persist the exact latest snapshot.
      void recovery.saveNow(latestRecoverableDraftRef.current).catch(() => undefined)
    }
    previousVisibleRef.current = visible
  // Visibility is the only trigger. recovery.saveNow intentionally reads the
  // latest snapshot from the ref rather than restarting this effect per edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  function command(confirmed = false) {
    return buildSpeechCommand({ context, draft, confirmed })
  }

  function payload(nextCommand = command()): GeneratePayload {
    if (!currentRoute || currentRoute.id !== routeSelectionId(nextCommand.route)) {
      throw new Error("Choose the exact recording route again before generating.")
    }
    return toGeneratePayload(nextCommand)
  }

  async function executeGeneration(next: SpeechGenerationCommand, updateEditorial: boolean) {
    setBusy("generate")
    try {
      if (updateEditorial && baseline && onUpdateEditorial) {
        await onUpdateEditorial({ expected_revision: baseline.revision, ...next.editorialPatch })
      }
      await onGenerate(payload(next))
      await recovery.clear()
    } finally {
      setBusy(null)
    }
  }

  async function saveDraft() {
    if (!onSave) return
    setBusy("draft")
    try {
      await onSave(payload())
      await recovery.clear()
    } finally {
      setBusy(null)
    }
  }

  function continueGeneration(next: SpeechGenerationCommand, updateEditorial: boolean) {
    const warnAbove = Number(config?.prefs?.warn_above || 0)
    if (!next.confirmed && warnAbove > 0 && estimate > warnAbove) {
      setPendingCommand({ command: next, updateEditorial })
      setConfirmationEstimate(estimate)
      return
    }
    void executeGeneration(next, updateEditorial).catch(() => undefined)
  }

  function generate(next = command()) {
    if (baseline && Object.keys(next.editorialPatch).length) {
      setEditorialCommand(next)
      return
    }
    continueGeneration(next, false)
  }

  const performancePresets = selectedCapability
    ? (directory.registry?.presets || []).filter((preset) => preset.capability_ids.includes(selectedCapability.id))
    : []
  const methodLabel = selectedCapability?.name || "Choose a route first"

  return {
    productionId, sessionId, nextPartNumber, insertAt, insertBeforePartId, part, config, directory, cast, playingKey, playerPlaying, onSave, onPlay,
    route, identityId, castRoleId, language, format, deliveryModeRequest, instruction, rate, pitch, volume,
    busy, confirmationEstimate, pendingCommand, editorialCommand, textReviewReference,
    identities, selectedIdentity, selectedCastRole, compatibleRoutes, visibleRoutes, currentRoute, selectedCapability, capabilityControls, deliveryMode,
    textSession, languageOptions, taggedIncompatible, hasInlineDeliveryTag, estimate, textPassEstimate, destination,
    recovery, performancePresets, methodLabel,
    setLanguage, setFormat, setDeliveryModeRequest, setInstruction, setRate, setPitch, setVolume,
    setConfirmationEstimate, setPendingCommand, setEditorialCommand,
    applyRoute, selectIdentity, selectCastRole, removeInlineTags, payload, saveDraft, executeGeneration, continueGeneration, generate,
  }
}

export type ComposerController = ReturnType<typeof useComposerController>

const ComposerContext = createContext<ComposerController | null>(null)

export function ComposerProvider({ value, children }: { value: ComposerController; children: ReactNode }) {
  return <ComposerContext.Provider value={value}>{children}</ComposerContext.Provider>
}

export function useComposer() {
  const value = useContext(ComposerContext)
  if (!value) throw new Error("Composer components must be rendered inside ComposerProvider.")
  return value
}
