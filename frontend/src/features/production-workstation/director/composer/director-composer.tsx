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
  availableReferenceMediaTypes, compatibleModels, normalizeCapabilityCatalog, operationCapability,
  type DirectorCapabilityCatalog, type DirectorModelCapability,
  type DirectorOperation,
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
  const objectUrls = useRef(new Set<string>())
  const refreshedOutputIds = useRef(new Set<number>())
  const { generations, submitting, create, cancel } = useDirectorGenerations(productionId, setComposerError)
  const activeGenerations = generations.filter(({ status }) => status === "queued" || status === "generating")

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

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

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
  const disabledReason = !capability ? "Director capabilities are loading." : capability.prompt.required && !prompt.trim() ? "Write what you want to create." : prompt.length > capability.prompt.max_length ? `Keep the direction under ${capability.prompt.max_length.toLocaleString()} characters.` : referenceUploads || pendingAttachment ? "Wait for references to finish uploading." : failedAttachment ? "Remove the reference that failed to upload." : missing.length ? `Add ${missing.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" and ")}.` : missingChoice ? `Add ${missingChoice.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" or ")}.` : controlsIssue
  const referenceMediaTypes = capability ? availableReferenceMediaTypes(capability, advanced.parameters) : []
  const fileAccept = referenceMediaTypes.map((kind) => `${kind}/*`).join(",")

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
    if (!capability) return
    const kinds = availableReferenceMediaTypes(capability, advanced.parameters)
    let staged = [...attachments]
    for (const file of files) {
      const kind = fileKind(file)
      if (!kind || !kinds.includes(kind)) {
        setComposerError(`${file.name} is not a compatible reference for this model operation.`)
        continue
      }
      const usesNestedReference = !capability.inputs.some(({ media_types }) => media_types.includes(kind))
      if (usesNestedReference) {
        setReferenceUploads((count) => count + 1)
        void onUploadReference(file).then(receiveAsset).catch((reason) => {
          setComposerError(reason instanceof Error ? reason.message : `${file.name} could not be uploaded.`)
        }).finally(() => setReferenceUploads((count) => Math.max(0, count - 1)))
        continue
      }
      const previewUrl = URL.createObjectURL(file)
      objectUrls.current.add(previewUrl)
      const id = identifier("attachment")
      const transient: DirectorComposerAttachment = { id, name: file.name, kind, role: "", previewUrl, status: "uploading" }
      const next = assignInputs([...staged, transient], capability)
      if (!next.some((attachment) => attachment.id === id)) {
        URL.revokeObjectURL(previewUrl)
        objectUrls.current.delete(previewUrl)
        setComposerError(`${model?.label || "This model"} has no available ${kind} input slot.`)
        continue
      }
      staged = next
      setAttachments(next)
      void onUploadReference(file).then((asset) => {
        const canonicalKind = assetKind(asset)
        if (!canonicalKind) throw new Error("The upload did not produce a compatible canonical Asset.")
        setAttachments((current) => assignInputs(current.map((attachment) => attachment.id === id ? {
          ...attachment, assetId: asset.id, name: visualAssetName(asset), kind: canonicalKind,
          previewUrl: assetPreview(asset), posterUrl: visualAssetPosterUrl(asset), file: undefined, status: "ready", error: undefined,
        } : attachment), capability))
        URL.revokeObjectURL(previewUrl)
        objectUrls.current.delete(previewUrl)
      }).catch((reason) => setAttachments((current) => current.map((attachment) => attachment.id === id ? {
        ...attachment, status: "failed", error: reason instanceof Error ? reason.message : "Upload failed.",
      } : attachment)))
    }
  }

  function receiveAsset(asset: VentureAsset) {
    const kind = assetKind(asset)
    if (!kind || !capability || !availableReferenceMediaTypes(capability, advanced.parameters).includes(kind)) {
      setComposerError(`${visualAssetName(asset)} is not compatible with this model operation.`)
      return
    }
    if (!capability.inputs.some(({ media_types }) => media_types.includes(kind))) {
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
    addAttachments([{ id: identifier(`asset-${asset.id}`), assetId: asset.id, name: visualAssetName(asset), kind, role: "", previewUrl: assetPreview(asset), posterUrl: visualAssetPosterUrl(asset), status: "ready" }])
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
    setRatio(generation.recipe.controls.ratio)
    setResolution(generation.recipe.controls.resolution)
    setDuration(generation.recipe.controls.duration || nextCapability.durations[0] || nextCapability.duration_range?.default || 0)
    setAdvanced({
      seed: generation.recipe.controls.seed === null ? "" : String(generation.recipe.controls.seed),
      fps: generation.recipe.controls.fps || nextCapability.fps[0] || 0,
      negativePrompt: generation.recipe.negative_prompt,
      parameters: { ...capabilityDefaults(nextCapability).advanced.parameters, ...generation.recipe.controls.provider_parameters },
    })
    setAttachments(assignInputs(generationAttachments(generation, libraryAssets), nextCapability))
    setComposerError("")
  }

  if (!catalog || !model || !capability) return <section className="director-composer-shell" aria-label="Create visual material"><div className="director-composer-loading">Loading Director capabilities…</div>{composerError && <p className="director-composer-error" role="alert">{composerError}</p>}</section>

  return <section className="director-composer-shell" aria-label="Create visual material">
    <DirectorComposerInput
      prompt={prompt} operations={catalog.operations} operation={operation} capability={capability}
      model={model} models={models} attachments={visibleAttachments} missingRoles={missing}
      ratio={ratio} resolution={resolution} duration={duration} advanced={advanced}
      assets={libraryAssets}
      busy={submitting} disabledReason={disabledReason}
      uploadStatus={referenceUploads ? `Uploading ${referenceUploads === 1 ? "reference" : `${referenceUploads} references`}…` : uploading ? uploadLabel : undefined} fileAccept={fileAccept}
      onPromptChange={setPrompt} onOperationChange={changeOperation}
      onModelChange={(nextId) => { const next = models.find(({ id }) => id === nextId); if (next) applyModel(next) }}
      onRatioChange={setRatio} onResolutionChange={setResolution} onDurationChange={setDuration}
      onAdvancedChange={setAdvanced} onFiles={receiveFiles}
      onRemoveAttachment={removeReference}
      onOpenLibrary={() => setLibraryOpen(true)} onPaste={() => void pasteFromClipboard()}
      onSubmit={() => void createGeneration()}
    />
    {composerError && <p className="director-composer-error" role="alert">{composerError}</p>}
    {activeGenerations.length > 0 && <div className="director-generation-list is-active" aria-label="Active Director generations">{activeGenerations.map((generation) => {
      const generationModel = catalog.models.find(({ id }) => id === generation.recipe.model_id)
      const generationCapability = generationModel && operationCapability(generationModel, generation.recipe.operation)
      const outputAsset = libraryAssets.find(({ id }) => id === generation.output_asset_ids[0])
      return <DirectorGenerationCard
        key={generation.id} operations={catalog.operations} generation={generation}
        canCancel={Boolean(generationCapability?.supports_cancel)} outputReady={Boolean(outputAsset)}
        onCancel={() => void cancel(generation)} onRegenerate={() => createGeneration(generation)}
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
          return <DirectorGenerationCard key={generation.id} operations={catalog.operations} generation={generation} canCancel={Boolean(generationCapability?.supports_cancel)} outputReady={Boolean(outputAsset)} onCancel={() => void cancel(generation)} onRegenerate={() => createGeneration(generation)} onUseSettings={() => { useSettings(generation); setHistoryOpen(false) }} onPreview={outputAsset && onPreviewGenerated ? () => onPreviewGenerated(outputAsset) : undefined} onAddToTimeline={outputAsset && onAddGeneratedToTimeline ? () => void onAddGeneratedToTimeline(outputAsset) : undefined} />
        })}</div>
      </DialogContent>
    </Dialog></div>}
    <DirectorReferenceLibraryDialog open={libraryOpen} assets={libraryAssets} acceptedMediaTypes={referenceMediaTypes} onOpenChange={setLibraryOpen} onAdd={receiveAsset} />
  </section>
}
