import { History } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { VentureAsset } from "@/types/domain"
import { visualAssetName, visualAssetPosterUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import { DirectorComposerInput } from "./director-composer-input"
import {
  availableReferenceMediaTypes, catalogReferenceMediaTypes, compatibleDirectInputTarget, compatibleModels, directReferenceMediaTypes, normalizeCapabilityCatalog, operationCapability,
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
import "./director-composer.css"

export function DirectorComposer({ productionId, uploading, uploadLabel, libraryAssets, onUploadReference, onGenerationOutputReady, onPreviewGenerated, onAddGeneratedToTimeline }: {
  productionId: number
  uploading: boolean
  uploadLabel: string
  libraryAssets: VentureAsset[]
  onUploadReference: (file: File) => Promise<VentureAsset>
  onGenerationOutputReady?: () => Promise<void>
  onPreviewGenerated?: (asset: VentureAsset) => void
  onAddGeneratedToTimeline?: (asset: VentureAsset) => Promise<void>
}) {
  const [catalog, setCatalog] = useState<DirectorCapabilityCatalog | null>(null)
  const [prompt, setPrompt] = useState("")
  const [operation, setOperation] = useState<DirectorOperation>("")
  const [modelId, setModelId] = useState("")
  const [attachments, setAttachments] = useState<DirectorComposerAttachment[]>([])
  const [ratio, setRatio] = useState("")
  const [resolution, setResolution] = useState("")
  const [duration, setDuration] = useState(0)
  const [advanced, setAdvanced] = useState<DirectorAdvancedValues>({ seed: "", fps: 0, negativePrompt: "", parameters: {} })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [referenceUploads, setReferenceUploads] = useState(0)
  const [composerError, setComposerError] = useState("")
  const refreshedOutputIds = useRef(new Set<number>())
  const { generations, submitting, workingId, create, cancel, confirm, retryIngestion } = useDirectorGenerations(productionId, setComposerError)
  const latestGeneration = generations[0]
  const surfacedGenerations = generations.filter(({ status }) => status === "queued" || status === "generating")
  if (latestGeneration?.status === "failed" && !surfacedGenerations.some(({ id }) => id === latestGeneration.id)) surfacedGenerations.push(latestGeneration)

  useEffect(() => {
    let active = true
    void studioApi.directorModels().then((capabilities) => {
      if (!active) return
      const next = normalizeCapabilityCatalog(capabilities as DirectorCapabilityCatalog)
      const firstOperation = next.operations[0]?.id || ""
      const firstModel = compatibleModels(next.models, firstOperation)[0]
      const firstCapability = firstModel && operationCapability(firstModel, firstOperation)
      setCatalog(next)
      setOperation(firstOperation)
      if (firstModel && firstCapability) {
        const initial = capabilityDefaults(firstCapability)
        setModelId(firstModel.id)
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
    const newOutputIds = generations
      .filter(({ status }) => status === "ready")
      .flatMap(({ output_asset_ids: outputAssetIds }) => outputAssetIds)
      .filter((assetId) => !refreshedOutputIds.current.has(assetId))
    if (!newOutputIds.length || !onGenerationOutputReady) return
    newOutputIds.forEach((assetId) => refreshedOutputIds.current.add(assetId))
    void onGenerationOutputReady().catch((reason) => {
      newOutputIds.forEach((assetId) => refreshedOutputIds.current.delete(assetId))
      setComposerError(reason instanceof Error ? reason.message : "The generated Asset could not be loaded.")
    })
  }, [generations, onGenerationOutputReady])

  const models = useMemo(() => catalog ? compatibleModels(catalog.models, operation) : [], [catalog, operation])
  const model = models.find(({ id }) => id === modelId) || models[0]
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
  const referenceMediaTypes = capability && catalog ? catalogReferenceMediaTypes(catalog.models, capability, advanced.parameters) : []
  const fileAccept = referenceMediaTypes.map((kind) => `${kind}/*`).join(",")
  const inputCounts = capability ? Object.fromEntries(capability.inputs.map(({ role }) => [
    role, attachments.filter((attachment) => attachment.assetId && attachment.role === role).length,
  ])) : {}
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
    if (!catalog) return
    const nextModel = compatibleModels(catalog.models, next)[0]
    if (!nextModel) return
    setOperation(next)
    applyModel(nextModel, next)
  }

  function addAttachments(incoming: DirectorComposerAttachment[]) {
    if (!capability) return
    const normalized = assignInputs([...attachments, ...incoming], capability)
    const retainedIds = new Set(normalized.map(({ id }) => id))
    const dropped = incoming.filter(({ id }) => !retainedIds.has(id))
    setAttachments(normalized)
    setComposerError(dropped.length ? `${model?.label || "This model"} has no available compatible input slot for ${dropped[0]?.name}.` : "")
  }

  function receiveFiles(files: File[]) {
    if (!capability || !catalog) return
    for (const file of files) {
      const kind = fileKind(file)
      if (!kind || !referenceMediaTypes.includes(kind)) {
        setComposerError(`${file.name} is not supported by an available Director operation.`)
        continue
      }
      setReferenceUploads((count) => count + 1)
      void onUploadReference(file).then(receiveAsset).catch((reason) => {
        setComposerError(reason instanceof Error ? reason.message : `${file.name} could not be uploaded.`)
      }).finally(() => setReferenceUploads((count) => Math.max(0, count - 1)))
    }
  }

  function receiveAsset(asset: VentureAsset) {
    const kind = assetKind(asset)
    if (!kind || !capability || !catalog || !model) {
      setComposerError(`${visualAssetName(asset)} is not supported by Director.`)
      return
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
      setLibraryOpen(false)
      return
    }
    const target = compatibleDirectInputTarget(catalog.models, model, capability, kind, attachments.map((attachment) => attachment.kind))
    if (!target) {
      setComposerError(`${visualAssetName(asset)} has no available compatible reference position.`)
      return
    }
    const incoming = { id: identifier(`asset-${asset.id}`), assetId: asset.id, name: visualAssetName(asset), kind, role: "", previewUrl: assetPreview(asset), posterUrl: visualAssetPosterUrl(asset), status: "ready" as const }
    if (target.capability === capability) {
      addAttachments([incoming])
    } else {
      const initial = capabilityDefaults(target.capability)
      setOperation(target.capability.operation)
      setModelId(target.model.id)
      setRatio(initial.ratio)
      setResolution(initial.resolution)
      setDuration(initial.duration)
      setAdvanced(initial.advanced)
      setAttachments(assignInputs([...attachments, incoming], target.capability))
      setComposerError("")
    }
    setLibraryOpen(false)
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

  async function pasteFromClipboard() {
    try {
      const clipboard = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of clipboard) {
        const type = item.types.find((candidate) => candidate.startsWith("image/") || candidate.startsWith("audio/") || candidate.startsWith("video/"))
        if (!type) continue
        const blob = await item.getType(type)
        files.push(new File([blob], `pasted-${Date.now()}.${type.split("/")[1] || "media"}`, { type }))
      }
      if (files.length) receiveFiles(files)
      else setComposerError("The clipboard does not contain compatible media.")
    } catch {
      setComposerError("Clipboard access was not available. Paste directly into the prompt instead.")
    }
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

  if (!catalog || !model || !capability) return <section className="director-composer-shell" aria-label="Create visual material"><div className="director-composer-loading">Loading Director capabilities…</div>{composerError && <p className="director-composer-error" role="alert">{composerError}</p>}</section>

  return <section className="director-composer-shell" aria-label="Create visual material">
    <DirectorComposerInput
      prompt={prompt} operations={catalog.operations} operation={operation} capability={presentedCapability || capability}
      model={model} models={models} attachments={visibleAttachments} missingRoles={missing}
      ratio={ratio} resolution={resolution} duration={duration} advanced={advanced}
      assets={libraryAssets}
      busy={submitting} disabledReason={disabledReason}
      uploadStatus={referenceUploads ? `Uploading ${referenceUploads === 1 ? "reference" : `${referenceUploads} references`}…` : uploading ? uploadLabel : undefined} fileAccept={fileAccept}
      onPromptChange={setPrompt} onOperationChange={changeOperation}
      onModelChange={(nextId) => { const next = models.find(({ id }) => id === nextId); if (next) applyModel(next) }}
      onRatioChange={setRatio} onResolutionChange={setResolution} onDurationChange={setDuration}
      onAdvancedChange={changeAdvanced} onFiles={receiveFiles}
      onRemoveAttachment={removeReference}
      onOpenLibrary={() => setLibraryOpen(true)} onPaste={() => void pasteFromClipboard()}
      onSubmit={() => void createGeneration()}
    />
    {composerError && <p className="director-composer-error" role="alert">{composerError}</p>}
    {surfacedGenerations.length > 0 && <div className="director-generation-list is-active" aria-label="Current Director generations">{surfacedGenerations.map((generation) => {
      const generationModel = catalog.models.find(({ id }) => id === generation.recipe.model_id)
      const generationCapability = generationModel && operationCapability(generationModel, generation.recipe.operation)
      const outputAsset = libraryAssets.find(({ id }) => id === generation.output_asset_ids[0])
      return <DirectorGenerationCard
        key={generation.id} operations={catalog.operations} generation={generation}
        canCancel={Boolean(generationCapability?.supports_cancel)} outputReady={Boolean(outputAsset)} working={workingId === generation.id}
        onCancel={() => void cancel(generation)} onRegenerate={() => createGeneration(generation)}
        onConfirm={() => void confirm(generation)} onRetrySaving={() => void retryIngestion(generation)}
        onUseSettings={() => useSettings(generation)}
        onPreview={outputAsset && onPreviewGenerated ? () => onPreviewGenerated(outputAsset) : undefined}
        onAddToTimeline={outputAsset && onAddGeneratedToTimeline ? () => {
          void onAddGeneratedToTimeline(outputAsset).catch((reason) => setComposerError(
            reason instanceof Error ? reason.message : "The generated Asset could not be added to Timeline."))
        } : undefined}
      />
    })}</div>}
    {generations.length > 0 && <div className="director-history-entry"><Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><History />Generation history <span>{generations.length}</span></Button></DialogTrigger>
      <DialogContent className="director-history-dialog">
        <DialogHeader><DialogTitle>Generation history</DialogTitle><DialogDescription>Previous Director requests for this Production. Ready outputs remain in Production visuals.</DialogDescription></DialogHeader>
        <div className="director-generation-list" aria-label="Director generation history">{generations.map((generation) => {
          const generationModel = catalog.models.find(({ id }) => id === generation.recipe.model_id)
          const generationCapability = generationModel && operationCapability(generationModel, generation.recipe.operation)
          const outputAsset = libraryAssets.find(({ id }) => id === generation.output_asset_ids[0])
          return <DirectorGenerationCard key={generation.id} operations={catalog.operations} generation={generation} canCancel={Boolean(generationCapability?.supports_cancel)} outputReady={Boolean(outputAsset)} working={workingId === generation.id} onCancel={() => void cancel(generation)} onConfirm={() => void confirm(generation)} onRetrySaving={() => void retryIngestion(generation)} onRegenerate={() => createGeneration(generation)} onUseSettings={() => { useSettings(generation); setHistoryOpen(false) }} onPreview={outputAsset && onPreviewGenerated ? () => onPreviewGenerated(outputAsset) : undefined} onAddToTimeline={outputAsset && onAddGeneratedToTimeline ? () => void onAddGeneratedToTimeline(outputAsset) : undefined} />
        })}</div>
      </DialogContent>
    </Dialog></div>}
    <DirectorReferenceLibraryDialog open={libraryOpen} assets={libraryAssets} acceptedMediaTypes={referenceMediaTypes} onOpenChange={setLibraryOpen} onAdd={receiveAsset} />
  </section>
}
