import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useCreatorDraftRecovery } from "@/hooks/use-creator-draft-recovery"
import { useCreatorText } from "@/hooks/use-creator-text"
import {
  buildSpeechCommand,
  compositionContext,
  DEFAULT_RECORDING_VOLUME,
  editorialBaseline,
  recoverableDraft,
  replacementRouteSelectionFromPart,
  resolveSelectedRoute,
  routeSelection,
  routeSelectionFromPart,
  routeSelectionId,
  toGeneratePayload,
  type CreatorText,
  type CompositionDraft,
  type SpeechGenerationCommand,
  type TextReviewReference,
} from "@/lib/creator-contract"
import { creatorCapabilityControls, resolvedDeliveryMode, selectedRouteCapability } from "@/lib/creator-capability"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import { outputLanguageOptions } from "@/lib/voice-capabilities"
import { getVoiceIdentities, routesForIdentity, type VoiceChoice, type VoiceIdentityChoice } from "@/lib/voice-options"
import { ssmlToPlainText, validateSsmlDocument, wrapPlainTextAsSsml } from "@/lib/ssml"
import type { DurableJob, GeneratePayload, GenerateResult, PartEditorialUpdate, PlayerSource, ProjectPart, StudioConfig, VoiceDirectory } from "@/types/domain"

export type SpeechCreatorSurfaceProps = {
  projectId?: number
  nextPartNumber?: number
  insertAt?: number | null
  insertBeforePartId?: string | null
  part?: ProjectPart | null
  config: StudioConfig | null
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onSave?: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial?: (values: PartEditorialUpdate) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onPlay: (source: PlayerSource) => void
  /** Standalone hosts keep this active for the full durable Job, not only enqueue. */
  generationState?: "recovering" | "active" | null
  /** Visual hosts may hide the Creator without unmounting it. */
  visible?: boolean
}

type PendingGeneration = {
  command: SpeechGenerationCommand
  updateEditorial: boolean
}

export function useSpeechCreatorController({ projectId, nextPartNumber = 1, insertAt = null, insertBeforePartId = null, part = null, config, directory, playingKey, playerPlaying, onSave, onUpdateEditorial, onGenerate, onPlay, generationState = null, visible = true }: SpeechCreatorSurfaceProps) {
  const [route, setRoute] = useState(routeSelectionFromPart(part))
  const [identityId, setIdentityId] = useState(part?.voice_identity_id || "")
  const [language, setLanguage] = useState(part?.language || "Auto")
  const [format, setFormat] = useState<GeneratePayload["format"]>((part?.format as GeneratePayload["format"]) || "mp3")
  const [deliveryModeRequest, setDeliveryModeRequest] = useState<string>(part?.speech_mode || "exact")
  const [instruction, setInstruction] = useState(part?.instruction || "")
  const [rate, setRate] = useState(part?.rate ?? 1)
  const [pitch, setPitch] = useState(part?.pitch ?? 1)
  const [volume, setVolume] = useState(part?.volume ?? DEFAULT_RECORDING_VOLUME)
  const [seed, setSeed] = useState(part?.seed ?? 0)
  const [enableSsml, setEnableSsml] = useState(Boolean(part?.enable_ssml))
  const [authoredRole, setAuthoredRole] = useState(String(part?.authored_role || "").trim())
  const [roleBusy, setRoleBusy] = useState(false)
  const [busy, setBusy] = useState<"draft" | "generate" | null>(null)
  const [confirmationEstimate, setConfirmationEstimate] = useState<number | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingGeneration | null>(null)
  const [editorialCommand, setEditorialCommand] = useState<SpeechGenerationCommand | null>(null)
  const [textReviewReference, setTextReviewReference] = useState<TextReviewReference | null>(null)
  const persistTextPreparationRef = useRef<(reference: TextReviewReference | null, text?: CreatorText) => Promise<void>>(async () => undefined)

  useEffect(() => {
    setBusy(null)
    setConfirmationEstimate(null)
    setPendingCommand(null)
    setEditorialCommand(null)
    setTextReviewReference(null)
    setRoute(routeSelectionFromPart(part))
    setIdentityId(part?.voice_identity_id || "")
    setLanguage(part?.language || "Auto")
    setFormat((part?.format as GeneratePayload["format"]) || "mp3")
    setDeliveryModeRequest(part?.speech_mode || "exact")
    setInstruction(part?.instruction || "")
    setRate(part?.rate ?? 1)
    setPitch(part?.pitch ?? 1)
    setVolume(part?.volume ?? DEFAULT_RECORDING_VOLUME)
    setSeed(part?.seed ?? 0)
    setEnableSsml(Boolean(part?.enable_ssml))
  }, [part?.id])

  useEffect(() => {
    setAuthoredRole(String(part?.authored_role || "").trim())
  }, [part?.authored_role, part?.id])

  const identities = useMemo(
    () => getVoiceIdentities(directory.registry ?? null, directory.identities),
    [directory.identities, directory.registry],
  )
  const selectedIdentity = identities.find((identity) => identity.identityId === identityId)
  const compatibleRoutes = useMemo(() => {
    return routesForIdentity(selectedIdentity, language)
  }, [language, selectedIdentity])
  const visibleRoutes = selectedIdentity?.routes || []
  const selectedRoute = selectedIdentity?.routes.find((item) => item.id === routeSelectionId(route))
  const currentRoute = resolveSelectedRoute(route, compatibleRoutes)
  const selectedCapability = selectedRouteCapability(currentRoute, route?.capabilityId)
  const capabilityControls = creatorCapabilityControls(selectedCapability)
  const deliveryMode = resolvedDeliveryMode(capabilityControls, deliveryModeRequest)
  const textSession = useCreatorText(part, projectId, selectedCapability?.id || null, {
    reviewReference: textReviewReference,
    onReviewReferenceChange: async (reference, nextText) => {
      setTextReviewReference(reference)
      await persistTextPreparationRef.current(reference, nextText)
    },
  })
  const languageOptions = outputLanguageOptions(config, selectedIdentity)
  const formatOptions = useMemo(() => {
    const supported = config?.formats?.length ? config.formats : ["mp3"]
    return supported.includes(format) ? supported : [format, ...supported]
  }, [config?.formats, format])
  const outputFormatSupported = !config?.formats?.length || config.formats.includes(format)

  function applyRoute(nextRoute: VoiceChoice | undefined, capabilityId?: string | null) {
    setRoute(nextRoute ? routeSelection(nextRoute, capabilityId) : null)
  }

  function selectIdentity(identity: VoiceIdentityChoice) {
    setIdentityId(identity.identityId)
    setRoute(null)
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
    if (!selectedRoute) {
      const replacement = replacementRouteSelectionFromPart(part, selectedIdentity.routes)
      if (replacement) setRoute(replacement)
      else if (route) setRoute(null)
    }
  }, [directory.registry?.bindings, identities, identityId, part?.binding_id, part?.capability_id, part?.catalogue_voice_id, part?.engine, part?.model, part?.provider, part?.voice_identity_id, selectedIdentity, selectedRoute, route])

  const documentedTags = useMemo(() => new Set([
    ...Object.values(config?.tags || {}).flatMap((group) => Array.isArray(group) ? group : Object.keys(group)),
    ...(Array.isArray(config?.retired_tags) ? config.retired_tags : Object.keys(config?.retired_tags || {})),
  ].map((tag) => tag.toLocaleLowerCase())), [config?.retired_tags, config?.tags])
  const hasInlineDeliveryTag = Array.from(textSession.text.matchAll(/\[([^\[\]]{1,40})\]/g))
    .some((match) => documentedTags.has((match[1] || "").toLocaleLowerCase()))
  const taggedIncompatible = Boolean(currentRoute) && !capabilityControls.deliveryTags && hasInlineDeliveryTag
  const ssmlValidation = enableSsml
    ? validateSsmlDocument(textSession.text)
    : { valid: true, message: "Plain text" }
  const enableSsmlDocument = () => {
    textSession.updateText(wrapPlainTextAsSsml(textSession.text))
    setEnableSsml(true)
  }
  const usePlainText = () => {
    textSession.updateText(ssmlToPlainText(textSession.text))
    setEnableSsml(false)
  }
  const estimate = textSession.text.length * Number(currentRoute?.estimateRatePerMillionCharacters || 0) / 1_000_000
  const textPassEstimate = textSession.text.length * Number(config?.text_preparation?.estimated_price_per_million_characters || 0) / 1_000_000
  const destination = !projectId
    ? "Reusable recording"
    : part
      ? `Edit ${formatAuthoredRole(authoredRole) || "speech"} · Part ${formatPartNumber(part.position ?? 0)}`
      : insertAt === null ? `New speech · Part ${nextPartNumber}` : `New speech · before Part ${insertAt + 1}`
  const context = useMemo(() => compositionContext({ projectId, part, insertBeforePartId }), [insertBeforePartId, part, projectId])
  const baseline = useMemo(() => editorialBaseline(part), [part])
  const draft: CompositionDraft = {
    authoredRole,
    // Every registry identity is stable enough to restore an operator choice.
    // Generation still projects voice_identity_id only for owned routes.
    voiceIdentityId: selectedIdentity?.identityId || null,
    route,
    text: { raw: textSession.states.raw, shaped: textSession.states.shaped, tagged: textSession.states.tagged, active: textSession.view },
    textPreparation: { tagDensity: textSession.density, spokenProfile: textSession.spokenProfile, pendingReview: textReviewReference },
    // Provider capability controls what generation sends, not what the
    // recoverable authored Draft is allowed to remember.
    delivery: { modeId: deliveryMode, instruction, rate, pitch, volume, seed, enableSsml: capabilityControls.ssml && enableSsml },
    output: { format, language: language || "Auto" },
    editorialPatch: {
      ...(baseline && textSession.states.raw !== baseline.script ? { script: textSession.states.raw } : {}),
    },
  }
  const latestRecoverableDraftRef = useRef(recoverableDraft(draft))
  latestRecoverableDraftRef.current = recoverableDraft(draft)
  const recovery = useCreatorDraftRecovery({
    context,
    draft: recoverableDraft(draft),
    onRestore: (saved) => {
      setAuthoredRole(saved.authoredRole || "")
      setIdentityId(saved.voiceIdentityId || "")
      setRoute(saved.route)
      setTextReviewReference(saved.textPreparation.pendingReview)
      textSession.restore(saved.text, saved.textPreparation.tagDensity, saved.textPreparation.spokenProfile)
      setDeliveryModeRequest(saved.delivery.modeId || "exact")
      setInstruction(saved.delivery.instruction)
      setRate(saved.delivery.rate)
      setPitch(saved.delivery.pitch)
      setVolume(saved.delivery.volume)
      setSeed(saved.delivery.seed)
      setEnableSsml(Boolean(saved.delivery.enableSsml))
      setFormat(saved.output.format)
      setLanguage(saved.output.language)
    },
    enabled: true,
  })
  persistTextPreparationRef.current = async (reference, nextText) => {
    const current = latestRecoverableDraftRef.current
    const next = { ...current, text: nextText || current.text, textPreparation: { tagDensity: textSession.density, spokenProfile: textSession.spokenProfile, pendingReview: reference } }
    latestRecoverableDraftRef.current = next
    await recovery.saveNow(next)
  }
  const previousVisibleRef = useRef(visible)
  useEffect(() => {
    if (previousVisibleRef.current && !visible) {
      // Collapsing keeps the Creator mounted, so the unmount flush cannot
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
    if (next.delivery.enableSsml) {
      const validation = validateSsmlDocument(next.text[next.text.active] || "")
      if (!validation.valid) throw new Error(validation.message)
    }
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

  async function saveRole(value: string) {
    const canonical = value.trim().replace(/\s+/g, " ")
    if (!part) {
      setAuthoredRole(canonical)
      return
    }
    if (!baseline || !onUpdateEditorial) return
    if (canonical === String(part.authored_role || "").trim().replace(/\s+/g, " ")) return
    setRoleBusy(true)
    try {
      await onUpdateEditorial({ expected_revision: baseline.revision, authored_role: canonical || null })
      setAuthoredRole(canonical)
    } finally {
      setRoleBusy(false)
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
    projectId, nextPartNumber, insertAt, insertBeforePartId, part, config, directory, playingKey, playerPlaying, onSave, onPlay, generationState,
    route, identityId, language, format, deliveryModeRequest, instruction, rate, pitch, volume, seed, enableSsml,
    busy, roleBusy, authoredRole, confirmationEstimate, pendingCommand, editorialCommand, textReviewReference,
    identities, selectedIdentity, compatibleRoutes, visibleRoutes, currentRoute, selectedCapability, capabilityControls, deliveryMode,
    formatOptions, outputFormatSupported,
    textSession, languageOptions, taggedIncompatible, hasInlineDeliveryTag, ssmlValidation, estimate, textPassEstimate, destination,
    recovery, performancePresets, methodLabel,
    setLanguage, setFormat, setDeliveryModeRequest, setInstruction, setRate, setPitch, setVolume, setSeed, setEnableSsml,
    setConfirmationEstimate, setPendingCommand, setEditorialCommand,
    applyRoute, selectIdentity, enableSsmlDocument, usePlainText, payload, saveDraft, saveRole, executeGeneration, continueGeneration, generate,
  }
}

export type SpeechCreatorController = ReturnType<typeof useSpeechCreatorController>

const SpeechCreatorContext = createContext<SpeechCreatorController | null>(null)

export function SpeechCreatorProvider({ value, children }: { value: SpeechCreatorController; children: ReactNode }) {
  return <SpeechCreatorContext.Provider value={value}>{children}</SpeechCreatorContext.Provider>
}

export function useSpeechCreator() {
  const value = useContext(SpeechCreatorContext)
  if (!value) throw new Error("Speech Creator components must be rendered inside SpeechCreatorProvider.")
  return value
}
