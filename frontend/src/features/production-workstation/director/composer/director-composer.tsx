import { useEffect, useMemo, useRef, useState } from "react"

import type { VentureAsset } from "@/types/domain"
import { DirectorLibraryDialog } from "../director-library-dialog"
import { DirectorPreviewDialog } from "../director-preview-dialog"
import { visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "../director-assets"
import type { DirectorAdvancedValues } from "./director-advanced-settings"
import type { DirectorComposerAttachment } from "./director-composer-attachments"
import { DirectorComposerInput } from "./director-composer-input"
import { acceptedKinds, compatibleModels, DIRECTOR_MODELS, requiredRoles, roleForAttachment, type DirectorAttachmentKind, type DirectorModelCapability, type DirectorOperation } from "./director-composer-config"
import { DirectorGenerationCard } from "./director-generation-card"
import "./director-composer.css"

export type DirectorGenerationStatus = "generating" | "ready" | "canceled"
export type DirectorGeneration = {
  id: string
  prompt: string
  negativePrompt: string
  operation: DirectorOperation
  provider: string
  modelId: string
  modelLabel: string
  modelVersion: string
  inputAssetIds: number[]
  inputRoles: { id: string; role: string; kind: DirectorAttachmentKind }[]
  ratio: string
  size: string
  resolution: string
  duration: number
  fps: number
  seed: number | null
  providerParameters: Record<string, unknown>
  status: DirectorGenerationStatus
  estimatedCost: null
  jobId: null
  progress: number
  createdAt: string
  updatedAt: string
  outputAssetIds: number[]
  attachments: DirectorComposerAttachment[]
}

function identifier(prefix: string) {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function fileKind(file: File): DirectorAttachmentKind | null {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return null
}

function normalizeAttachments(attachments: DirectorComposerAttachment[], operation: DirectorOperation, model: DirectorModelCapability) {
  const kinds = acceptedKinds(operation)
  let imageIndex = 0
  let audioIndex = 0
  return attachments.filter((attachment) => kinds.includes(attachment.kind)).filter((attachment) => {
    if (attachment.kind === "audio") return audioIndex++ < model.maxAudio
    return imageIndex++ < model.maxImages
  }).map((attachment, index, retained) => ({
    ...attachment,
    role: roleForAttachment(operation, attachment.kind, retained.slice(0, index).filter(({ kind }) => kind === attachment.kind).length),
  }))
}

function modelDefaults(model: DirectorModelCapability) {
  return {
    ratio: model.ratios[0] || "1:1",
    resolution: model.resolutions[0] || "1K",
    duration: model.durations[0] || 5,
    advanced: { seed: "", fps: model.fps[0] || 24, negativePrompt: "" } satisfies DirectorAdvancedValues,
  }
}

export function DirectorComposer({ uploading, uploadLabel, libraryAssets }: {
  uploading: boolean
  uploadLabel: string
  libraryAssets: VentureAsset[]
}) {
  const [prompt, setPrompt] = useState("")
  const [operation, setOperation] = useState<DirectorOperation>("image")
  const [modelId, setModelId] = useState("model-a")
  const [attachments, setAttachments] = useState<DirectorComposerAttachment[]>([])
  const initialModel = DIRECTOR_MODELS[0]!
  const initialDefaults = modelDefaults(initialModel)
  const [ratio, setRatio] = useState(initialDefaults.ratio)
  const [resolution, setResolution] = useState(initialDefaults.resolution)
  const [duration, setDuration] = useState(initialDefaults.duration)
  const [advanced, setAdvanced] = useState(initialDefaults.advanced)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<VentureAsset | null>(null)
  const [composerError, setComposerError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [generations, setGenerations] = useState<DirectorGeneration[]>([])
  const objectUrls = useRef(new Set<string>())
  const timers = useRef(new Map<string, number>())

  const models = useMemo(() => compatibleModels(operation), [operation])
  const model = models.find(({ id }) => id === modelId) || models[0] || initialModel
  const required = requiredRoles(operation)
  const missing = required.filter((role) => !attachments.some((attachment) => attachment.role === role))
  const disabledReason = !prompt.trim() ? "Write what you want to create." : missing.length ? `Add ${missing.map((role) => role.replaceAll("-", " ")).join(" and ")}.` : undefined
  const fileAccept = operation === "talking-video" ? "image/*,audio/*" : "image/*"

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    timers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  function applyModel(next: DirectorModelCapability, nextOperation = operation) {
    const defaults = modelDefaults(next)
    setModelId(next.id)
    setRatio(defaults.ratio)
    setResolution(defaults.resolution)
    setDuration(defaults.duration)
    setAdvanced(defaults.advanced)
    setAttachments((current) => normalizeAttachments(current, nextOperation, next))
    setComposerError("")
  }

  function changeOperation(next: DirectorOperation) {
    const nextModel = compatibleModels(next)[0] || initialModel
    setOperation(next)
    applyModel(nextModel, next)
  }

  function changeModel(nextId: string) {
    const next = models.find(({ id }) => id === nextId)
    if (next) applyModel(next)
  }

  function addAttachments(incoming: DirectorComposerAttachment[]) {
    const normalized = normalizeAttachments([...attachments, ...incoming], operation, model)
    const retainedIds = new Set(normalized.map(({ id }) => id))
    const dropped = incoming.filter(({ id }) => !retainedIds.has(id))
    setComposerError(dropped.length ? `${model.label} accepts ${model.maxImages} image${model.maxImages === 1 ? "" : "s"}${model.maxAudio ? ` and ${model.maxAudio} audio file` : ""} for ${operation.replaceAll("-", " ")}.` : "")
    setAttachments(normalized)
  }

  function receiveFiles(files: File[]) {
    const kinds = acceptedKinds(operation)
    const next = files.flatMap((file): DirectorComposerAttachment[] => {
      const kind = fileKind(file)
      if (!kind || !kinds.includes(kind)) {
        setComposerError(`${file.name} is not a compatible reference for ${operation.replaceAll("-", " ")}.`)
        return []
      }
      const previewUrl = URL.createObjectURL(file)
      objectUrls.current.add(previewUrl)
      return [{ id: identifier("attachment"), name: file.name, kind, role: roleForAttachment(operation, kind, 0), previewUrl, file, status: "ready" }]
    })
    if (next.length) addAttachments(next)
  }

  function receiveAsset(asset: VentureAsset) {
    if (asset.media_type !== "image") {
      setComposerError(`${visualAssetName(asset)} is not compatible with ${operation.replaceAll("-", " ")} in this prototype.`)
      return
    }
    addAttachments([{ id: identifier(`asset-${asset.id}`), assetId: asset.id, name: visualAssetName(asset), kind: "image", role: roleForAttachment(operation, "image", 0), previewUrl: visualAssetUrl(asset), posterUrl: visualAssetPosterUrl(asset), status: "ready" }])
    setLibraryOpen(false)
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

  function finishMock(id: string) {
    setGenerations((current) => current.map((generation) => generation.id === id ? { ...generation, status: "ready", progress: 100, updatedAt: new Date().toISOString() } : generation))
    timers.current.delete(id)
  }

  function createGeneration(source?: DirectorGeneration) {
    if (!source && disabledReason) return
    const now = new Date().toISOString()
    const id = identifier("generation")
    const parsedSeed = Number(advanced.seed)
    const generation: DirectorGeneration = source ? {
      ...source,
      id,
      status: "generating",
      progress: 12,
      jobId: null,
      outputAssetIds: [],
      createdAt: now,
      updatedAt: now,
    } : {
      id,
      prompt: prompt.trim(),
      negativePrompt: advanced.negativePrompt,
      operation,
      provider: model.provider,
      modelId: model.id,
      modelLabel: model.label,
      modelVersion: model.version,
      inputAssetIds: attachments.flatMap(({ assetId }) => assetId ? [assetId] : []),
      inputRoles: attachments.map(({ id: inputId, role, kind }) => ({ id: inputId, role, kind })),
      ratio,
      size: resolution,
      resolution,
      duration,
      fps: advanced.fps,
      seed: advanced.seed.trim() && Number.isFinite(parsedSeed) ? parsedSeed : null,
      providerParameters: {},
      status: "generating",
      estimatedCost: null,
      jobId: null,
      progress: 12,
      createdAt: now,
      updatedAt: now,
      outputAssetIds: [],
      attachments: [...attachments],
    }
    setSubmitting(true)
    setGenerations((current) => [generation, ...current])
    const submittingTimer = window.setTimeout(() => { setSubmitting(false); timers.current.delete(`${id}:submit`) }, 250)
    timers.current.set(`${id}:submit`, submittingTimer)
    const timer = window.setTimeout(() => finishMock(id), 1200)
    timers.current.set(id, timer)
  }

  function cancelGeneration(id: string) {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setGenerations((current) => current.map((generation) => generation.id === id ? { ...generation, status: "canceled", updatedAt: new Date().toISOString() } : generation))
  }

  function useSettings(generation: DirectorGeneration) {
    const nextOperation = generation.operation
    const nextModel = DIRECTOR_MODELS.find(({ id }) => id === generation.modelId) || compatibleModels(nextOperation)[0] || initialModel
    setPrompt(generation.prompt)
    setOperation(nextOperation)
    setModelId(nextModel.id)
    setRatio(generation.ratio)
    setResolution(generation.resolution)
    setDuration(generation.duration)
    setAdvanced({ seed: generation.seed === null ? "" : String(generation.seed), fps: generation.fps, negativePrompt: generation.negativePrompt })
    setAttachments(normalizeAttachments(generation.attachments, nextOperation, nextModel))
    setComposerError("")
  }

  return <section className="director-composer-shell" aria-label="Create visual material">
    <DirectorComposerInput
      prompt={prompt}
      operation={operation}
      model={model}
      models={models}
      attachments={attachments}
      missingRoles={missing}
      ratio={ratio}
      resolution={resolution}
      duration={duration}
      advanced={advanced}
      busy={submitting}
      disabledReason={disabledReason}
      uploadStatus={uploading ? uploadLabel : undefined}
      fileAccept={fileAccept}
      onPromptChange={setPrompt}
      onOperationChange={changeOperation}
      onModelChange={changeModel}
      onRatioChange={setRatio}
      onResolutionChange={setResolution}
      onDurationChange={setDuration}
      onAdvancedChange={setAdvanced}
      onFiles={receiveFiles}
      onRemoveAttachment={(id) => { setAttachments((current) => current.filter((attachment) => attachment.id !== id)); setComposerError("") }}
      onOpenLibrary={() => setLibraryOpen(true)}
      onPaste={() => void pasteFromClipboard()}
      onSubmit={() => createGeneration()}
    />
    {composerError && <p className="director-composer-error" role="alert">{composerError}</p>}
    {generations.length > 0 && <div className="director-generation-list" aria-label="Recent Director generations">{generations.map((generation) => <DirectorGenerationCard key={generation.id} generation={generation} onCancel={() => cancelGeneration(generation.id)} onRegenerate={() => createGeneration(generation)} onUseSettings={() => useSettings(generation)} />)}</div>}
    <DirectorLibraryDialog open={libraryOpen} assets={libraryAssets.filter((asset) => asset.media_type === "image")} pendingId={null} title="Choose a reference" description="Use an image already available in Visual Library as a generation reference." emptyDescription="Upload an image to Visual Library first." addLabel="Use reference" onOpenChange={setLibraryOpen} onPreview={setPreviewAsset} onAdd={receiveAsset} />
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </section>
}
