import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { studioApi } from "@/lib/api"
import type { SavedVisualReference, VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import { DirectorComposerInput } from "./director-composer-input"
import {
  availableReferenceMediaTypes, directReferenceMediaTypes, familyModes, modelFamilies, normalizeCapabilityCatalog, operationCapability,
  type DirectorCapabilityCatalog, type DirectorModelCapability,
  inputMode, ratioChoices, type DirectorOperation,
} from "./director-composer-config"
import {
  activeProviderParameters,
  addNestedReference,
  assetKind,
  assetPreview,
  assignInputs,
  capabilityDefaults,
  fileKind,
  generationAttachments,
  identifier,
  inputConstraintIssue,
  inputModeIssue,
  nestedReferenceAttachments,
  parameterIssue,
  removeNestedReference,
} from "./director-composer-state"
import { DirectorGenerationCard } from "./director-generation-card"
import type { DirectorGeneration, DirectorGenerationRecipe } from "./director-generation-types"
import { DirectorReferenceLibraryDialog } from "./director-reference-library-dialog"
import { useDirectorGenerations } from "./use-director-generations"
import { SavedReferenceCreateDialog } from "./saved-reference-create-dialog"
import type { DirectorCreationItem } from "../director-gallery"
import "./director-composer.css"

function operatorMessage(message: string) {
  return message.replace(/\bassets?\b/gi, "media").replace(/\bjobs?\b/gi, "requests")
}

function hiddenRequestsKey(productionId: number) {
  return `auvi-director-hidden-requests-${productionId}`
}

function initialHiddenRequests(productionId: number) {
  if (typeof window === "undefined") return new Set<string>()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(hiddenRequestsKey(productionId)) || "[]")
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [])
  } catch {
    return new Set<string>()
  }
}

export function DirectorComposer({ productionId, ventureId, createOpen, onCreateOpenChange, uploading, uploadLabel, libraryAssets, recentAssetIds = [], usageCounts, onUploadReference, onGenerationOutputReady, onPreviewGenerated, onAddGeneratedToTimeline, renderCreations }: {
  productionId: number
  ventureId?: number
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  uploading: boolean
  uploadLabel: string
  libraryAssets: VentureAsset[]
  recentAssetIds?: number[]
  usageCounts?: ReadonlyMap<number, number>
  onUploadReference: (file: File) => Promise<VentureAsset>
  onGenerationOutputReady?: () => Promise<void>
  onPreviewGenerated?: (asset: VentureAsset) => void
  onAddGeneratedToTimeline?: (asset: VentureAsset) => Promise<void>
  renderCreations?: (generatedOutputIds: Set<number>, generationItems: DirectorCreationItem[]) => ReactNode
}) {
  const [catalog, setCatalog] = useState<DirectorCapabilityCatalog | null>(null)
  const [prompt, setPrompt] = useState("")
  const [operation, setOperation] = useState<DirectorOperation>("")
  const [familyId, setFamilyId] = useState("")
  const [modelId, setModelId] = useState("")
  const [attachments, setAttachments] = useState<DirectorComposerAttachment[]>([])
  const [ratio, setRatio] = useState("")
  const [resolution, setResolution] = useState("")
  const [duration, setDuration] = useState(0)
  const [advanced, setAdvanced] = useState<DirectorAdvancedValues>({ seed: "", fps: 0, negativePrompt: "", parameters: {} })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pickerRole, setPickerRole] = useState<string | undefined>()
  const [pickerChecking, setPickerChecking] = useState(false)
  const [pickerCompatibility, setPickerCompatibility] = useState(new Map<number, { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }>())
  const [referenceUploads, setReferenceUploads] = useState(0)
  const [savedReferences, setSavedReferences] = useState<SavedVisualReference[]>([])
  const [saveReferenceOpen, setSaveReferenceOpen] = useState(false)
  const [composerError, setComposerError] = useState("")
  const [internalCreateOpen, setInternalCreateOpen] = useState(true)
  const [hiddenRequestIds, setHiddenRequestIds] = useState(() => initialHiddenRequests(productionId))
  const slotUploadRef = useRef<HTMLInputElement>(null)
  const pickerRequestId = useRef(0)
  const pickerAbort = useRef<AbortController | null>(null)
  const refreshedOutputIds = useRef(new Set<number>())
  const { generations, submitting, workingId, create, cancel, confirm, retryIngestion } = useDirectorGenerations(productionId, setComposerError)
  const panelOpen = createOpen ?? internalCreateOpen
  const setPanelOpen = onCreateOpenChange ?? setInternalCreateOpen
  const generatedOutputIds = useMemo(() => new Set(generations.flatMap(({ output_asset_ids }) => output_asset_ids)), [generations])
  const activeEstimate = useMemo(() => generations
    .filter(({ status, needs_confirmation }) => needs_confirmation || status === "queued" || status === "generating")
    .reduce((total, generation) => total + Number(generation.estimated_cost ?? 0), 0), [generations])

  useEffect(() => {
    let active = true
    void studioApi.directorModels().then((capabilities) => {
      if (!active) return
      const next = normalizeCapabilityCatalog(capabilities as DirectorCapabilityCatalog)
      const firstFamily = modelFamilies(next.models)[0]
      const firstMode = firstFamily && familyModes(firstFamily)[0]
      setCatalog(next)
      if (firstFamily) setFamilyId(firstFamily.id)
      if (firstMode) {
        const initial = capabilityDefaults(firstMode.capability)
        setOperation(firstMode.operation)
        setModelId(firstMode.model.id)
        setRatio(initial.ratio)
        setResolution(initial.resolution)
        setDuration(initial.duration)
        setAdvanced(initial.advanced)
      }
    }).catch((reason) => {
      if (active) setComposerError(reason instanceof Error ? reason.message : "Director capabilities could not be loaded.")
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ventureId) return
    void studioApi.savedVisualReferences(ventureId).then(setSavedReferences).catch((reason) => setComposerError(reason instanceof Error ? reason.message : "Saved references could not be loaded."))
  }, [ventureId])

  useEffect(() => () => {
    pickerRequestId.current += 1
    pickerAbort.current?.abort()
    pickerAbort.current = null
  }, [modelId, operation])

  useEffect(() => {
    const newOutputIds = generations
      .filter(({ status }) => status === "ready")
      .flatMap(({ output_asset_ids: outputAssetIds }) => outputAssetIds)
      .filter((assetId) => !refreshedOutputIds.current.has(assetId))
    if (!newOutputIds.length || !onGenerationOutputReady) return
    newOutputIds.forEach((assetId) => refreshedOutputIds.current.add(assetId))
    void onGenerationOutputReady().catch((reason) => {
      newOutputIds.forEach((assetId) => refreshedOutputIds.current.delete(assetId))
      setComposerError(operatorMessage(reason instanceof Error ? reason.message : "The generated media could not be loaded."))
    })
  }, [generations, onGenerationOutputReady])

  const families = useMemo(() => catalog ? modelFamilies(catalog.models) : [], [catalog])
  const family = families.find(({ id }) => id === familyId) || families[0]
  const modes = family ? familyModes(family) : []
  const model = modes.find((mode) => mode.model.id === modelId && mode.operation === operation)?.model || modes[0]?.model
  const capability = model ? operationCapability(model, operation) : undefined
  const visibleAttachments = capability
    ? [...attachments, ...nestedReferenceAttachments(capability, advanced.parameters, libraryAssets)]
    : attachments
  const missing = capability?.inputs.filter((slot) => slot.required && !attachments.some((attachment) => attachment.role === slot.role && attachment.assetId)).map(({ role }) => role) || []
  const missingChoice = capability?.required_any_of.find((roles) => !roles.some((role) => attachments.some((attachment) => attachment.role === role && attachment.assetId)))
  const pendingAttachment = attachments.some(({ status }) => status === "uploading")
  const failedAttachment = attachments.some(({ status }) => status === "failed")
  const controlsIssue = capability ? parameterIssue(capability, advanced.parameters, duration, libraryAssets) : undefined
  const referenceIssue = capability ? inputConstraintIssue(capability, attachments, libraryAssets) : undefined
  const modeIssue = capability ? inputModeIssue(capability, attachments, advanced.parameters) : undefined
  const disabledReason = !capability ? "Director capabilities are loading." : capability.prompt.required && !prompt.trim() ? "Write what you want to create." : prompt.length > capability.prompt.max_length ? `Keep the direction under ${capability.prompt.max_length.toLocaleString()} characters.` : referenceUploads || pendingAttachment ? "Wait for references to finish uploading." : failedAttachment ? "Remove the reference that failed to upload." : missing.length ? `Add ${missing.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" and ")}.` : missingChoice ? `Add ${missingChoice.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" or ")}.` : referenceIssue || modeIssue || controlsIssue
  const inputCounts = capability ? Object.fromEntries(capability.inputs.map(({ role }) => [
    role, attachments.filter((attachment) => attachment.assetId && attachment.role === role).length,
  ])) : {}
  const referenceMediaTypes = capability
    ? availableReferenceMediaTypes(capability, advanced.parameters, inputCounts) : []
  const pickerSlot = capability?.inputs.find(({ role }) => role === pickerRole)
  const pickerMediaTypes = pickerSlot?.media_types || referenceMediaTypes
  const pickerFileAccept = pickerMediaTypes.map((kind) => `${kind}/*`).join(",")
  const availableInPickerSlot = pickerSlot
    ? Math.max(0, pickerSlot.max - attachments.filter(({ role, assetId }) => role === pickerSlot.role && assetId).length)
    : Number.POSITIVE_INFINITY
  const compatibleSavedReferences = savedReferences.filter((reference) => {
    const compatibleCount = reference.asset_ids.filter((id) => {
      const asset = libraryAssets.find((candidate) => candidate.id === id)
      return Boolean(asset && pickerMediaTypes.includes(asset.media_type as typeof pickerMediaTypes[number]) && pickerCompatibility.get(id)?.state === "compatible")
    }).length
    return compatibleCount > 0 && compatibleCount <= availableInPickerSlot
  })
  const activeInputMode = capability ? inputMode(capability, inputCounts) : undefined
  const presentedCapability = capability && activeInputMode ? {
    ...capability,
    ratios: activeInputMode.ratios,
    parameters: capability.parameters.filter((field) => {
      const allowed = activeInputMode.parameter_values?.[field.key]
      if (allowed?.length === 1) return false
      if (field.key !== "elements") return true
      const policy = activeInputMode.elements || {}
      if (policy.available === false) return false
      return !policy.available_when || Object.entries(policy.available_when).every(
        ([key, expected]) => advanced.parameters[key] === expected,
      )
    }),
  } : capability

  useEffect(() => {
    if (!capability || !activeInputMode) return
    setRatio((current) => activeInputMode.ratios.includes(current) ? current : activeInputMode.default_ratio)
    setAdvanced((current) => {
      let changed = false
      const parameters = { ...current.parameters }
      for (const [key, allowed] of Object.entries(activeInputMode.parameter_values || {})) {
        if (allowed.length === 1 && parameters[key] !== allowed[0]) {
          parameters[key] = allowed[0]
          changed = true
        }
      }
      return changed ? { ...current, parameters } : current
    })
  }, [activeInputMode, capability])

  function applyModel(next: DirectorModelCapability, nextOperation = operation) {
    const nextCapability = operationCapability(next, nextOperation)
    if (!nextCapability) return
    const initial = capabilityDefaults(nextCapability)
    setModelId(next.id)
    setRatio(initial.ratio)
    setResolution(initial.resolution)
    setDuration(initial.duration)
    setAdvanced(initial.advanced)
    if (!nextCapability.prompt.supported) setPrompt("")
    setAttachments((current) => assignInputs(current, nextCapability))
    setComposerError("")
  }

  function changeOperation(next: DirectorOperation) {
    const route = modes.find((mode) => mode.operation === next)
    if (!route) return
    setOperation(next)
    applyModel(route.model, next)
  }

  function changeFamily(nextId: string) {
    const nextFamily = families.find(({ id }) => id === nextId)
    const firstMode = nextFamily && familyModes(nextFamily)[0]
    if (!nextFamily || !firstMode) return
    setFamilyId(nextFamily.id)
    setOperation(firstMode.operation)
    applyModel(firstMode.model, firstMode.operation)
  }

  function addAttachments(incoming: DirectorComposerAttachment[]) {
    if (!capability) return
    const preview = assignInputs([...attachments, ...incoming], capability)
    const retainedIds = new Set(preview.map(({ id }) => id))
    const dropped = incoming.filter(({ id }) => !retainedIds.has(id))
    setAttachments((current) => assignInputs([...current, ...incoming], capability))
    setComposerError(dropped.length ? `${model?.label || "This model"} has no available compatible input slot for ${dropped[0]?.name}.` : "")
  }

  function receiveFiles(files: File[], preferredRole?: string) {
    if (!capability || !catalog) return
    const roleKinds = preferredRole
      ? capability.inputs.find(({ role }) => role === preferredRole)?.media_types || []
      : referenceMediaTypes
    for (const file of files) {
      const kind = fileKind(file)
      if (!kind || !roleKinds.includes(kind)) {
        setComposerError(
          `${file.name} is not compatible with ${preferredRole ? capability.inputs.find(({ role }) => role === preferredRole)?.label || "this input" : `${model?.label || "the selected model"} · ${catalog.operations.find(({ id }) => id === operation)?.label || operation}`}.`,
        )
        continue
      }
      setReferenceUploads((count) => count + 1)
      void onUploadReference(file).then((asset) => receiveAsset(asset, preferredRole)).catch((reason) => {
        setComposerError(operatorMessage(reason instanceof Error ? reason.message : `${file.name} could not be uploaded.`))
      }).finally(() => setReferenceUploads((count) => Math.max(0, count - 1)))
    }
  }

  async function compatibleAsset(asset: VentureAsset, role: string) {
    const cached = pickerCompatibility.get(asset.id)
    if (cached) return cached
    const [result] = await studioApi.directorInputCompatibility(productionId, {
      model_id: model!.id, operation, role, asset_ids: [asset.id],
    })
    return result || { state: "incompatible" as const, reasons: ["This media could not be verified."] }
  }

  function receiveAsset(asset: VentureAsset, preferredRole?: string, verified?: { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }) {
    const kind = assetKind(asset)
    if (!kind || !capability || !catalog || !model) {
      setComposerError(`${visualAssetName(asset)} is not supported by Director.`)
      return
    }
    const preferredSlot = preferredRole ? capability.inputs.find(({ role }) => role === preferredRole) : undefined
    if (preferredSlot && !preferredSlot.media_types.includes(kind)) {
      setComposerError(`${visualAssetName(asset)} is not compatible with ${preferredSlot.label}.`)
      return
    }
    if (preferredSlot) {
      const result = verified || pickerCompatibility.get(asset.id)
      if (!result) {
        void compatibleAsset(asset, preferredSlot.role).then((checked) => {
          receiveAsset(asset, preferredRole, checked)
        }).catch((reason) => setComposerError(
          reason instanceof Error ? reason.message : "This media could not be verified.",
        ))
        return
      }
      if (result.state !== "compatible") {
        setComposerError(result.reasons[0] || `${visualAssetName(asset)} is not compatible with ${preferredSlot.label}.`)
        return
      }
    }
    const nestedKinds = availableReferenceMediaTypes(capability, advanced.parameters)
      .filter((candidate) => !directReferenceMediaTypes(capability).includes(candidate))
    if (nestedKinds.includes(kind)) {
      const next = addNestedReference(capability, advanced.parameters, asset)
      if (!next) {
        setComposerError(`${visualAssetName(asset)} has no available compatible reference position.`)
        return
      }
      setAdvanced((current) => ({ ...current, parameters: addNestedReference(capability, current.parameters, asset) || current.parameters }))
      setComposerError("")
      closeLibrary()
      return
    }
    if (!directReferenceMediaTypes(capability).includes(kind)) {
      setComposerError(`${visualAssetName(asset)} has no available compatible reference position.`)
      return
    }
    const incoming = { id: identifier(`asset-${asset.id}`), assetId: asset.id, name: visualAssetName(asset), kind, role: preferredRole || "", previewUrl: assetPreview(asset), posterUrl: visualAssetPosterUrl(asset), status: "ready" as const }
    addAttachments([incoming])
    closeLibrary()
  }

  function closeLibrary() {
    pickerRequestId.current += 1
    pickerAbort.current?.abort()
    pickerAbort.current = null
    setPickerChecking(false)
    setLibraryOpen(false)
  }

  function changeLibraryOpen(open: boolean) {
    if (!open) closeLibrary()
    else setLibraryOpen(true)
  }

  function openLibrary(role?: string) {
    if (!role) {
      setComposerError("Choose a specific input before adding media.")
      return
    }
    setPickerRole(role)
    setLibraryOpen(true)
    setPickerChecking(true)
    setPickerCompatibility(new Map())
    if (!model) {
      setPickerChecking(false)
      return
    }
    pickerAbort.current?.abort()
    const controller = new AbortController()
    const requestId = ++pickerRequestId.current
    pickerAbort.current = controller
    void studioApi.directorInputCompatibility(productionId, {
      model_id: model.id, operation, role,
      asset_ids: libraryAssets.map(({ id }) => id),
    }, controller.signal).then((results) => {
      if (controller.signal.aborted || requestId !== pickerRequestId.current) return
      setPickerCompatibility(new Map(results.map(({ asset_id, state, reasons }) => [asset_id, { state, reasons }])))
    }).catch((reason) => {
      if (controller.signal.aborted || requestId !== pickerRequestId.current) return
      setComposerError(reason instanceof Error ? reason.message : "Compatible media could not be checked.")
    }).finally(() => {
      if (requestId !== pickerRequestId.current) return
      pickerAbort.current = null
      setPickerChecking(false)
    })
  }

  function removeReference(attachment: DirectorComposerAttachment) {
    if (attachment.nested) {
      setAdvanced((current) => ({
        ...current,
        parameters: removeNestedReference(current.parameters, attachment),
      }))
    } else {
      setAttachments((current) => current.filter(({ id }) => id !== attachment.id))
    }
    setComposerError("")
  }

  function swapFrames() {
    if (!capability) return
    setAttachments((current) => assignInputs(current.map((attachment) => {
      if (attachment.role === "start-frame") return { ...attachment, role: "end-frame" }
      if (attachment.role === "end-frame") return { ...attachment, role: "start-frame" }
      return attachment
    }), capability))
  }

  function hideGeneration(id: string) {
    setHiddenRequestIds((current) => {
      const next = new Set(current)
      next.add(id)
      try { window.localStorage.setItem(hiddenRequestsKey(productionId), JSON.stringify([...next])) } catch { /* Storage can be unavailable. */ }
      return next
    })
  }

  function applySavedReference(reference: SavedVisualReference) {
    const byId = new Map(libraryAssets.map((asset) => [asset.id, asset]))
    const candidates = reference.asset_ids.flatMap((id) => {
      const asset = byId.get(id)
      const kind = asset && assetKind(asset)
      return asset && kind && pickerMediaTypes.includes(kind) ? [asset] : []
    }).slice(0, availableInPickerSlot)
    candidates.forEach((asset) => void receiveAsset(asset, pickerRole))
    closeLibrary()
  }

  async function saveCurrentReference(name: string, type: SavedVisualReference["type"]) {
    if (!ventureId) throw new Error("This Production has no Venture reference scope.")
    const assetIds = [...new Set(visibleAttachments.flatMap(({ assetId }) => assetId ? [assetId] : []))]
    const created = await studioApi.createSavedVisualReference(ventureId, { name, type, asset_ids: assetIds })
    setSavedReferences((current) => [created, ...current])
  }

  function recipe(): DirectorGenerationRecipe {
    const parsedSeed = Number(advanced.seed)
    return {
      prompt: prompt.trim(), negative_prompt: advanced.negativePrompt,
      operation, model_id: model!.id,
      inputs: attachments.flatMap((attachment, position) => attachment.assetId ? [{ asset_id: attachment.assetId, role: attachment.role, media_type: attachment.kind, position }] : []),
      controls: {
        ratio, resolution,
        duration: capability!.durations.length || capability!.duration_range ? duration : null,
        fps: capability!.fps.length ? advanced.fps : null,
        seed: capability!.supports_seed && advanced.seed.trim() && Number.isFinite(parsedSeed) ? parsedSeed : null,
        provider_parameters: activeProviderParameters(capability!, advanced.parameters),
      },
    }
  }

  function changeAdvanced(next: DirectorAdvancedValues) {
    setAdvanced(next)
    if (!capability) return
    const choices = ratioChoices(capability, next.parameters, inputCounts)
    setRatio((current) => choices.values.includes(current)
      ? current : choices.default)
  }

  function createGeneration(source?: DirectorGeneration) {
    if (!source && disabledReason) return
    setComposerError("")
    void create(source?.recipe || recipe())
  }

  function useSettings(generation: DirectorGeneration) {
    if (!catalog) return
    const nextModel = catalog.models.find(({ id }) => id === generation.recipe.model_id)
    const nextCapability = nextModel && operationCapability(nextModel, generation.recipe.operation)
    if (!nextModel || !nextCapability) {
      setComposerError("That saved model capability is no longer available.")
      return
    }
    setPrompt(generation.recipe.prompt)
    setOperation(generation.recipe.operation)
    setModelId(nextModel.id)
    const restoredFamily = families.find(({ routes }) => routes.some(({ id }) => id === nextModel.id))
    if (restoredFamily) setFamilyId(restoredFamily.id)
    const parameters = {
      ...capabilityDefaults(nextCapability).advanced.parameters,
      ...generation.recipe.controls.provider_parameters,
    }
    const restoredAttachments = assignInputs(generationAttachments(generation, libraryAssets), nextCapability)
    const restoredCounts = Object.fromEntries(nextCapability.inputs.map(({ role }) => [
      role, restoredAttachments.filter((attachment) => attachment.assetId && attachment.role === role).length,
    ]))
    const ratios = ratioChoices(nextCapability, parameters, restoredCounts)
    setRatio(ratios.values.includes(generation.recipe.controls.ratio)
      ? generation.recipe.controls.ratio : ratios.default)
    setResolution(generation.recipe.controls.resolution)
    setDuration(generation.recipe.controls.duration || nextCapability.durations[0] || nextCapability.duration_range?.default || 0)
    setAdvanced({
      seed: generation.recipe.controls.seed === null ? "" : String(generation.recipe.controls.seed),
      fps: generation.recipe.controls.fps || nextCapability.fps[0] || 0,
      negativePrompt: generation.recipe.negative_prompt,
      parameters,
    })
    setAttachments(restoredAttachments)
    setComposerError("")
  }

  function generationCard(generation: DirectorGeneration, compact = false) {
    const generationModel = catalog?.models.find(({ id }) => id === generation.recipe.model_id)
    const generationCapability = generationModel && operationCapability(generationModel, generation.recipe.operation)
    const outputAssets = generation.output_asset_ids.flatMap((assetId) => {
      const asset = libraryAssets.find(({ id }) => id === assetId)
      return asset ? [asset] : []
    })
    const outputAsset = outputAssets[0]
    return <DirectorGenerationCard
      key={generation.id} compact={compact} operations={catalog?.operations || []} generation={generation}
      usedCount={outputAsset ? usageCounts?.get(outputAsset.id) || 0 : 0}
      canCancel={Boolean(generationCapability?.supports_cancel)} outputAssets={outputAssets} working={workingId === generation.id}
      onCancel={() => void cancel(generation)} onRegenerate={() => createGeneration(generation)}
      onConfirm={() => void confirm(generation)} onRetrySaving={() => void retryIngestion(generation)}
      onUseSettings={() => useSettings(generation)}
      onPreview={outputAsset && onPreviewGenerated ? () => onPreviewGenerated(outputAsset) : undefined}
      onAddToTimeline={outputAsset && onAddGeneratedToTimeline ? () => {
        void onAddGeneratedToTimeline(outputAsset).catch((reason) => setComposerError(operatorMessage(
          reason instanceof Error ? reason.message : "The generated media could not be added to Timeline.")))
      } : undefined}
      onDismiss={generation.status === "failed" || generation.status === "canceled" || (generation.status === "ready" && generation.output_asset_ids.length === 0)
        ? () => hideGeneration(generation.id) : undefined}
    />
  }

  if (!catalog || !model || !capability) return <section className={`director-composer-shell${panelOpen ? "" : " is-create-collapsed"}`} aria-label="Create visual material">
    <aside className={`ws-left-pane director-create-panel${panelOpen ? "" : " is-collapsed"}`}>{panelOpen ? <><header className="ws-pane-header"><span><b>Create</b><small>Loading models…</small></span><OperatorTooltip label="Hide Create panel" detail="Give Creations more room while keeping Create one click away." side="bottom"><Button variant="ghost" size="icon-sm" aria-label="Hide Create panel" onClick={() => setPanelOpen(false)}><PanelLeftClose /></Button></OperatorTooltip></header><div className="director-composer-loading">Loading Director capabilities…</div>{composerError && <p className="director-composer-error" role="alert">{composerError}</p>}</> : <div className="ws-collapsed-pane"><OperatorTooltip label="Show Create panel" detail="Show model, mode, inputs and generation controls." side="right"><Button className="ws-pane-expand" variant="ghost" size="icon-sm" aria-label="Show Create panel" onClick={() => setPanelOpen(true)}><PanelLeftOpen /></Button></OperatorTooltip><span className="ws-collapsed-context"><Sparkles aria-hidden="true" /></span></div>}</aside>
    <section className="ws-center-pane director-creations-workspace" aria-labelledby="director-creations-title"><header className="ws-pane-header director-creations-heading"><span><b id="director-creations-title">Creations</b><small>Media for this Production</small></span></header>{renderCreations?.(new Set(), [])}</section>
  </section>

  return <section className={`director-composer-shell${panelOpen ? "" : " is-create-collapsed"}`} aria-label="Create visual material">
    <aside className={`ws-left-pane director-create-panel${panelOpen ? "" : " is-collapsed"}`}>
      {!panelOpen ? <div className="ws-collapsed-pane"><OperatorTooltip label="Show Create panel" detail="Show model, mode, inputs and generation controls." side="right"><Button className="ws-pane-expand" variant="ghost" size="icon-sm" aria-label="Show Create panel" onClick={() => setPanelOpen(true)}><PanelLeftOpen /></Button></OperatorTooltip><span className="ws-collapsed-context"><Sparkles aria-hidden="true" /></span></div> : <>
      <header className="ws-pane-header director-create-heading"><span><b>Create</b><small>{model.label}</small></span><OperatorTooltip label="Hide Create panel" detail="Give Creations more room without losing this setup." side="bottom"><Button variant="ghost" size="icon-sm" aria-label="Hide Create panel" onClick={() => setPanelOpen(false)}><PanelLeftClose /></Button></OperatorTooltip></header>
      <DirectorComposerInput
      prompt={prompt} operations={catalog.operations.filter(({ id }) => modes.some((mode) => mode.operation === id))} operation={operation} capability={presentedCapability || capability}
      model={model} models={families} modelFamilyId={family?.id || ""} attachments={visibleAttachments} missingRoles={missing}
      ratio={ratio} resolution={resolution} duration={duration} advanced={advanced}
      assets={libraryAssets}
      productionId={productionId}
      busy={submitting} disabledReason={disabledReason}
      uploadStatus={referenceUploads ? `Uploading ${referenceUploads === 1 ? "reference" : `${referenceUploads} references`}…` : uploading ? uploadLabel : undefined}
      onPromptChange={setPrompt} onOperationChange={changeOperation}
      onModelChange={changeFamily}
      onRatioChange={setRatio} onResolutionChange={setResolution} onDurationChange={setDuration}
      onAdvancedChange={changeAdvanced}
      onRemoveAttachment={removeReference}
      onOpenLibrary={openLibrary}
      onSwapFrames={swapFrames}
      canSaveReference={visibleAttachments.some(({ assetId }) => assetId) && Boolean(ventureId)}
      onSaveReference={() => setSaveReferenceOpen(true)}
      onSubmit={() => void createGeneration()}
      />
      {composerError && <p className="director-composer-error" role="alert">{composerError}</p>}
      </>}
    </aside>
    <section className="ws-center-pane director-creations-workspace" aria-labelledby="director-creations-title">
      <header className="ws-pane-header director-creations-heading"><span><b id="director-creations-title">Creations</b><small>{generations.length} requests</small></span>{activeEstimate > 0 && <span className="director-active-estimate">Generation pending</span>}</header>
    {renderCreations ? renderCreations(
      generatedOutputIds,
      generations.filter(({ id }) => !hiddenRequestIds.has(id)).map((generation) => ({
        id: generation.id,
        status: generation.status === "ready" && generation.output_asset_ids.length === 0 ? "failed" : generation.status,
        mediaType: generation.output_media_type,
        createdAt: generation.created_at,
        node: generationCard(generation, true),
      })),
    ) : <div className="director-generation-list" aria-label="Director requests">{generations.map((generation) => generationCard(generation))}</div>}
    </section>
    <input ref={slotUploadRef} hidden multiple type="file" accept={pickerFileAccept} onChange={(event) => { if (event.target.files?.length) receiveFiles(Array.from(event.target.files), pickerRole); event.target.value = "" }} />
    <DirectorReferenceLibraryDialog open={libraryOpen} title={pickerSlot?.label} assets={libraryAssets} recentAssetIds={recentAssetIds} savedReferences={compatibleSavedReferences} acceptedMediaTypes={pickerMediaTypes} compatibility={pickerCompatibility} checking={pickerChecking} onOpenChange={changeLibraryOpen} onAdd={(asset) => void receiveAsset(asset, pickerRole)} onAddReference={applySavedReference} onUpload={() => slotUploadRef.current?.click()} />
    <SavedReferenceCreateDialog open={saveReferenceOpen} count={visibleAttachments.filter(({ assetId }) => assetId).length} onOpenChange={setSaveReferenceOpen} onCreate={saveCurrentReference} />
  </section>
}
