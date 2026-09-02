import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { CreatorLibraryWorkspace } from "../library/creator-library-workspace"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { SavedVisualReference, WorkspaceFile } from "@/types/domain"
import { visualFileName, visualFilePosterUrl } from "@/features/projects/audiovisual/library/visual-files"
import type { MediaAdvancedValues } from "./media-advanced-settings"
import type { MediaCreatorAttachment } from "./media-creator-attachments"
import { MediaCreatorInput } from "./media-creator-input"
import {
  availableReferenceMediaTypes, directReferenceMediaTypes, familyModes, modelFamilies, normalizeCapabilityCatalog, operationCapability,
  type MediaCapabilityCatalog, type MediaModelCapability,
  inputMode, ratioChoices, type MediaOperation,
} from "./media-creator-config"
import {
  activeProviderParameters,
  addNestedReference,
  fileAttachmentKind,
  filePreviewUrl,
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
} from "./media-creator-state"
import { MediaGenerationCard } from "./media-generation-card"
import type { MediaGeneration, MediaGenerationPreset } from "./media-generation-types"
import { MediaReferenceLibraryDialog } from "./media-reference-library-dialog"
import { useMediaGenerations } from "./use-media-generations"
import { SavedReferenceCreateDialog } from "./saved-reference-create-dialog"
import type { ProjectLibraryCreationItem } from "@/features/projects/audiovisual/library/project-library-gallery"
import "./media-creator.css"

function operatorMessage(message: string) {
  return message.replace(/\bassets?\b/gi, "media").replace(/\bjobs?\b/gi, "requests")
}

function hiddenRequestsKey(context: CreatorContext) {
  const owner = context.project_id
    ? `project-${context.project_id}`
    : context.object_id
      ? `object-${context.object_id}`
      : context.folder_id
        ? `folder-${context.folder_id}`
        : `workspace-${context.workspace_id}`
  return `origins-media-hidden-requests-${owner}`
}

function initialHiddenRequests(context: CreatorContext) {
  if (typeof window === "undefined") return new Set<string>()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(hiddenRequestsKey(context)) || "[]")
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [])
  } catch {
    return new Set<string>()
  }
}

export function MediaCreator({ context, createOpen, onCreateOpenChange, creatorNavigation, uploading, uploadLabel, libraryFiles, recentFileIds = [], usageCounts, onUploadReference, onGenerationOutputReady, onPreviewGenerated, onAddGeneratedToTimeline, renderLibrary }: {
  context: CreatorContext
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  creatorNavigation?: ReactNode
  uploading: boolean
  uploadLabel: string
  libraryFiles: WorkspaceFile[]
  recentFileIds?: number[]
  usageCounts?: ReadonlyMap<number, number>
  onUploadReference: (file: File) => Promise<WorkspaceFile>
  onGenerationOutputReady?: () => Promise<void>
  onPreviewGenerated?: (file: WorkspaceFile) => void
  onAddGeneratedToTimeline?: (file: WorkspaceFile) => Promise<void>
  renderLibrary?: (generatedOutputIds: Set<number>, generationItems: ProjectLibraryCreationItem[]) => ReactNode
}) {
  const workspaceId = context.workspace_id
  const preferredOutputType = context.selection?.output_media_type === "image" || context.selection?.output_media_type === "video"
    ? context.selection.output_media_type
    : null
  const [catalog, setCatalog] = useState<MediaCapabilityCatalog | null>(null)
  const [prompt, setPrompt] = useState("")
  const [operation, setOperation] = useState<MediaOperation>("")
  const [familyId, setFamilyId] = useState("")
  const [modelId, setModelId] = useState("")
  const [attachments, setAttachments] = useState<MediaCreatorAttachment[]>([])
  const [ratio, setRatio] = useState("")
  const [resolution, setResolution] = useState("")
  const [duration, setDuration] = useState(0)
  const [advanced, setAdvanced] = useState<MediaAdvancedValues>({ seed: "", fps: 0, negativePrompt: "", parameters: {} })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pickerRole, setPickerRole] = useState<string | undefined>()
  const [pickerChecking, setPickerChecking] = useState(false)
  const [pickerCompatibility, setPickerCompatibility] = useState(new Map<number, { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }>())
  const [referenceUploads, setReferenceUploads] = useState(0)
  const [savedReferences, setSavedReferences] = useState<SavedVisualReference[]>([])
  const [saveReferenceOpen, setSaveReferenceOpen] = useState(false)
  const [creatorError, setCreatorError] = useState("")
  const [internalCreateOpen, setInternalCreateOpen] = useState(true)
  const [hiddenRequestIds, setHiddenRequestIds] = useState(() => initialHiddenRequests(context))
  const slotUploadRef = useRef<HTMLInputElement>(null)
  const pickerRequestId = useRef(0)
  const pickerAbort = useRef<AbortController | null>(null)
  const refreshedOutputIds = useRef(new Set<number>())
  const { generations, submitting, workingId, create, cancel, confirm, retryIngestion } = useMediaGenerations(context, setCreatorError)
  const panelOpen = createOpen ?? internalCreateOpen
  const setPanelOpen = onCreateOpenChange ?? setInternalCreateOpen
  const generatedOutputIds = useMemo(() => new Set(generations.flatMap(({ output_file_ids }) => output_file_ids)), [generations])
  const activeEstimate = useMemo(() => generations
    .filter(({ status, needs_confirmation }) => needs_confirmation || status === "queued" || status === "generating")
    .reduce((total, generation) => total + Number(generation.estimated_cost ?? 0), 0), [generations])

  useEffect(() => {
    let active = true
    void originsApi.mediaModels().then((capabilities) => {
      if (!active) return
      const next = normalizeCapabilityCatalog(capabilities as MediaCapabilityCatalog)
      const allFamilies = modelFamilies(next.models)
      const preferredMode = preferredOutputType
        ? allFamilies.flatMap((candidate) => familyModes(candidate).map((mode) => ({ family: candidate, mode })))
          .find(({ mode }) => mode.capability.output_media_type === preferredOutputType)
        : undefined
      if (preferredOutputType && !preferredMode) {
        setCatalog(next)
        setFamilyId("")
        setOperation("")
        setModelId("")
        setCreatorError(
          `No ${preferredOutputType} generation model is currently available.`,
        )
        return
      }
      const firstFamily = preferredMode?.family || allFamilies[0]
      const firstMode = preferredMode?.mode || (firstFamily && familyModes(firstFamily)[0])
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
      if (active) setCreatorError(reason instanceof Error ? reason.message : "Media capabilities could not be loaded.")
    })
    return () => { active = false }
  }, [preferredOutputType])

  useEffect(() => {
    void originsApi.workspaceSavedVisualReferences(workspaceId).then(setSavedReferences).catch((reason) => setCreatorError(reason instanceof Error ? reason.message : "Saved references could not be loaded."))
  }, [workspaceId])

  useEffect(() => () => {
    pickerRequestId.current += 1
    pickerAbort.current?.abort()
    pickerAbort.current = null
  }, [modelId, operation])

  useEffect(() => {
    const newOutputIds = generations
      .filter(({ status }) => status === "ready")
      .flatMap(({ output_file_ids: outputFileIds }) => outputFileIds)
      .filter((fileId) => !refreshedOutputIds.current.has(fileId))
    if (!newOutputIds.length || !onGenerationOutputReady) return
    newOutputIds.forEach((fileId) => refreshedOutputIds.current.add(fileId))
    void onGenerationOutputReady().catch((reason) => {
      newOutputIds.forEach((fileId) => refreshedOutputIds.current.delete(fileId))
      setCreatorError(operatorMessage(reason instanceof Error ? reason.message : "The generated media could not be loaded."))
    })
  }, [generations, onGenerationOutputReady])

  const families = useMemo(() => catalog ? modelFamilies(catalog.models) : [], [catalog])
  const preferredOutputUnavailable = Boolean(
    catalog && preferredOutputType
    && !families.some((candidate) => familyModes(candidate).some(
      ({ capability }) => capability.output_media_type === preferredOutputType,
    )),
  )
  const family = families.find(({ id }) => id === familyId) || families[0]
  const modes = family ? familyModes(family) : []
  const model = modes.find((mode) => mode.model.id === modelId && mode.operation === operation)?.model || modes[0]?.model
  const capability = model ? operationCapability(model, operation) : undefined
  const visibleAttachments = capability
    ? [...attachments, ...nestedReferenceAttachments(capability, advanced.parameters, libraryFiles)]
    : attachments
  const missing = capability?.inputs.filter((slot) => slot.required && !attachments.some((attachment) => attachment.role === slot.role && attachment.fileId)).map(({ role }) => role) || []
  const missingChoice = capability?.required_any_of.find((roles) => !roles.some((role) => attachments.some((attachment) => attachment.role === role && attachment.fileId)))
  const pendingAttachment = attachments.some(({ status }) => status === "uploading")
  const failedAttachment = attachments.some(({ status }) => status === "failed")
  const controlsIssue = capability ? parameterIssue(capability, advanced.parameters, duration, libraryFiles) : undefined
  const referenceIssue = capability ? inputConstraintIssue(capability, attachments, libraryFiles) : undefined
  const modeIssue = capability ? inputModeIssue(capability, attachments, advanced.parameters) : undefined
  const disabledReason = !capability ? "Media capabilities are loading." : capability.prompt.required && !prompt.trim() ? "Write what you want to create." : prompt.length > capability.prompt.max_length ? `Keep the direction under ${capability.prompt.max_length.toLocaleString()} characters.` : referenceUploads || pendingAttachment ? "Wait for references to finish uploading." : failedAttachment ? "Remove the reference that failed to upload." : missing.length ? `Add ${missing.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" and ")}.` : missingChoice ? `Add ${missingChoice.map((role) => capability.inputs.find((slot) => slot.role === role)?.label || role).join(" or ")}.` : referenceIssue || modeIssue || controlsIssue
  const inputCounts = capability ? Object.fromEntries(capability.inputs.map(({ role }) => [
    role, attachments.filter((attachment) => attachment.fileId && attachment.role === role).length,
  ])) : {}
  const referenceMediaTypes = capability
    ? availableReferenceMediaTypes(capability, advanced.parameters, inputCounts) : []
  const pickerSlot = capability?.inputs.find(({ role }) => role === pickerRole)
  const pickerMediaTypes = pickerSlot?.media_types || referenceMediaTypes
  const pickerFileAccept = pickerMediaTypes.map((kind) => `${kind}/*`).join(",")
  const availableInPickerSlot = pickerSlot
    ? Math.max(0, pickerSlot.max - attachments.filter(({ role, fileId }) => role === pickerSlot.role && fileId).length)
    : Number.POSITIVE_INFINITY
  const compatibleSavedReferences = savedReferences.filter((reference) => {
    const compatibleCount = reference.file_ids.filter((id) => {
      const file = libraryFiles.find((candidate) => candidate.id === id)
      return Boolean(file && pickerMediaTypes.includes(file.media_type as typeof pickerMediaTypes[number]) && pickerCompatibility.get(id)?.state === "compatible")
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

  function applyModel(next: MediaModelCapability, nextOperation = operation) {
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
    setCreatorError("")
  }

  function changeOperation(next: MediaOperation) {
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

  function addAttachments(incoming: MediaCreatorAttachment[]) {
    if (!capability) return
    const preview = assignInputs([...attachments, ...incoming], capability)
    const retainedIds = new Set(preview.map(({ id }) => id))
    const dropped = incoming.filter(({ id }) => !retainedIds.has(id))
    setAttachments((current) => assignInputs([...current, ...incoming], capability))
    setCreatorError(dropped.length ? `${model?.label || "This model"} has no available compatible input slot for ${dropped[0]?.name}.` : "")
  }

  function receiveFiles(files: File[], preferredRole?: string) {
    if (!capability || !catalog) return
    const roleKinds = preferredRole
      ? capability.inputs.find(({ role }) => role === preferredRole)?.media_types || []
      : referenceMediaTypes
    for (const file of files) {
      const kind = fileKind(file)
      if (!kind || !roleKinds.includes(kind)) {
        setCreatorError(
          `${file.name} is not compatible with ${preferredRole ? capability.inputs.find(({ role }) => role === preferredRole)?.label || "this input" : `${model?.label || "the selected model"} · ${catalog.operations.find(({ id }) => id === operation)?.label || operation}`}.`,
        )
        continue
      }
      setReferenceUploads((count) => count + 1)
      void onUploadReference(file).then((file) => receiveFile(file, preferredRole)).catch((reason) => {
        setCreatorError(operatorMessage(reason instanceof Error ? reason.message : `${file.name} could not be uploaded.`))
      }).finally(() => setReferenceUploads((count) => Math.max(0, count - 1)))
    }
  }

  async function compatibleFile(file: WorkspaceFile, role: string) {
    const cached = pickerCompatibility.get(file.id)
    if (cached) return cached
    const [result] = await originsApi.mediaInputCompatibility(context, {
      model_id: model!.id, operation, role, file_ids: [file.id],
    })
    return result || { state: "incompatible" as const, reasons: ["This media could not be verified."] }
  }

  function receiveFile(file: WorkspaceFile, preferredRole?: string, verified?: { state: "compatible" | "incompatible" | "unknown"; reasons: string[] }) {
    const kind = fileAttachmentKind(file)
    if (!kind || !capability || !catalog || !model) {
      setCreatorError(`${visualFileName(file)} is not supported by Media.`)
      return
    }
    const preferredSlot = preferredRole ? capability.inputs.find(({ role }) => role === preferredRole) : undefined
    if (preferredSlot && !preferredSlot.media_types.includes(kind)) {
      setCreatorError(`${visualFileName(file)} is not compatible with ${preferredSlot.label}.`)
      return
    }
    if (preferredSlot) {
      const result = verified || pickerCompatibility.get(file.id)
      if (!result) {
        void compatibleFile(file, preferredSlot.role).then((checked) => {
          receiveFile(file, preferredRole, checked)
        }).catch((reason) => setCreatorError(
          reason instanceof Error ? reason.message : "This media could not be verified.",
        ))
        return
      }
      if (result.state !== "compatible") {
        setCreatorError(result.reasons[0] || `${visualFileName(file)} is not compatible with ${preferredSlot.label}.`)
        return
      }
    }
    const nestedKinds = availableReferenceMediaTypes(capability, advanced.parameters)
      .filter((candidate) => !directReferenceMediaTypes(capability).includes(candidate))
    if (nestedKinds.includes(kind)) {
      const next = addNestedReference(capability, advanced.parameters, file)
      if (!next) {
        setCreatorError(`${visualFileName(file)} has no available compatible reference position.`)
        return
      }
      setAdvanced((current) => ({ ...current, parameters: addNestedReference(capability, current.parameters, file) || current.parameters }))
      setCreatorError("")
      closeLibrary()
      return
    }
    if (!directReferenceMediaTypes(capability).includes(kind)) {
      setCreatorError(`${visualFileName(file)} has no available compatible reference position.`)
      return
    }
    const incoming = { id: identifier(`file-${file.id}`), fileId: file.id, name: visualFileName(file), kind, role: preferredRole || "", previewUrl: filePreviewUrl(file), posterUrl: visualFilePosterUrl(file), status: "ready" as const }
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
      setCreatorError("Choose a specific input before adding media.")
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
    void originsApi.mediaInputCompatibility(context, {
      model_id: model.id, operation, role,
      file_ids: libraryFiles.map(({ id }) => id),
    }, controller.signal).then((results) => {
      if (controller.signal.aborted || requestId !== pickerRequestId.current) return
      setPickerCompatibility(new Map(results.map(({ file_id, state, reasons }) => [file_id, { state, reasons }])))
    }).catch((reason) => {
      if (controller.signal.aborted || requestId !== pickerRequestId.current) return
      setCreatorError(reason instanceof Error ? reason.message : "Compatible media could not be checked.")
    }).finally(() => {
      if (requestId !== pickerRequestId.current) return
      pickerAbort.current = null
      setPickerChecking(false)
    })
  }

  function removeReference(attachment: MediaCreatorAttachment) {
    if (attachment.nested) {
      setAdvanced((current) => ({
        ...current,
        parameters: removeNestedReference(current.parameters, attachment),
      }))
    } else {
      setAttachments((current) => current.filter(({ id }) => id !== attachment.id))
    }
    setCreatorError("")
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
      try { window.localStorage.setItem(hiddenRequestsKey(context), JSON.stringify([...next])) } catch { /* Storage can be unavailable. */ }
      return next
    })
  }

  function applySavedReference(reference: SavedVisualReference) {
    const byId = new Map(libraryFiles.map((file) => [file.id, file]))
    const candidates = reference.file_ids.flatMap((id) => {
      const file = byId.get(id)
      const kind = file && fileAttachmentKind(file)
      return file && kind && pickerMediaTypes.includes(kind) ? [file] : []
    }).slice(0, availableInPickerSlot)
    candidates.forEach((file) => void receiveFile(file, pickerRole))
    closeLibrary()
  }

  async function saveCurrentReference(name: string, type: SavedVisualReference["type"]) {
    const fileIds = [...new Set(visibleAttachments.flatMap(({ fileId }) => fileId ? [fileId] : []))]
    const payload = { name, type, file_ids: fileIds }
    const created = await originsApi.createWorkspaceSavedVisualReference(workspaceId, payload)
    setSavedReferences((current) => [created, ...current])
  }

  function preset(): MediaGenerationPreset {
    const parsedSeed = Number(advanced.seed)
    return {
      prompt: prompt.trim(), negative_prompt: advanced.negativePrompt,
      operation, model_id: model!.id,
      inputs: attachments.flatMap((attachment, position) => attachment.fileId ? [{ file_id: attachment.fileId, role: attachment.role, media_type: attachment.kind, position }] : []),
      controls: {
        ratio, resolution,
        duration: capability!.durations.length || capability!.duration_range ? duration : null,
        fps: capability!.fps.length ? advanced.fps : null,
        seed: capability!.supports_seed && advanced.seed.trim() && Number.isFinite(parsedSeed) ? parsedSeed : null,
        provider_parameters: activeProviderParameters(capability!, advanced.parameters),
      },
    }
  }

  function changeAdvanced(next: MediaAdvancedValues) {
    setAdvanced(next)
    if (!capability) return
    const choices = ratioChoices(capability, next.parameters, inputCounts)
    setRatio((current) => choices.values.includes(current)
      ? current : choices.default)
  }

  function createGeneration(source?: MediaGeneration) {
    if (!source && disabledReason) return
    setCreatorError("")
    void create(source?.preset || preset())
  }

  function useSettings(generation: MediaGeneration) {
    if (!catalog) return
    const nextModel = catalog.models.find(({ id }) => id === generation.preset.model_id)
    const nextCapability = nextModel && operationCapability(nextModel, generation.preset.operation)
    if (!nextModel || !nextCapability) {
      setCreatorError("That saved model capability is no longer available.")
      return
    }
    setPrompt(generation.preset.prompt)
    setOperation(generation.preset.operation)
    setModelId(nextModel.id)
    const restoredFamily = families.find(({ routes }) => routes.some(({ id }) => id === nextModel.id))
    if (restoredFamily) setFamilyId(restoredFamily.id)
    const parameters = {
      ...capabilityDefaults(nextCapability).advanced.parameters,
      ...generation.preset.controls.provider_parameters,
    }
    const restoredAttachments = assignInputs(generationAttachments(generation, libraryFiles), nextCapability)
    const restoredCounts = Object.fromEntries(nextCapability.inputs.map(({ role }) => [
      role, restoredAttachments.filter((attachment) => attachment.fileId && attachment.role === role).length,
    ]))
    const ratios = ratioChoices(nextCapability, parameters, restoredCounts)
    setRatio(ratios.values.includes(generation.preset.controls.ratio)
      ? generation.preset.controls.ratio : ratios.default)
    setResolution(generation.preset.controls.resolution)
    setDuration(generation.preset.controls.duration || nextCapability.durations[0] || nextCapability.duration_range?.default || 0)
    setAdvanced({
      seed: generation.preset.controls.seed === null ? "" : String(generation.preset.controls.seed),
      fps: generation.preset.controls.fps || nextCapability.fps[0] || 0,
      negativePrompt: generation.preset.negative_prompt,
      parameters,
    })
    setAttachments(restoredAttachments)
    setCreatorError("")
  }

  function generationCard(generation: MediaGeneration, compact = false) {
    const generationModel = catalog?.models.find(({ id }) => id === generation.preset.model_id)
    const generationCapability = generationModel && operationCapability(generationModel, generation.preset.operation)
    const outputFiles = generation.output_file_ids.flatMap((fileId) => {
      const file = libraryFiles.find(({ id }) => id === fileId)
      return file ? [file] : []
    })
    const outputFile = outputFiles[0]
    return <MediaGenerationCard
      key={generation.id} compact={compact} operations={catalog?.operations || []} generation={generation}
      usedCount={outputFile ? usageCounts?.get(outputFile.id) || 0 : 0}
      canCancel={Boolean(generationCapability?.supports_cancel)} outputFiles={outputFiles} working={workingId === generation.id}
      onCancel={() => void cancel(generation)} onRegenerate={() => createGeneration(generation)}
      onConfirm={() => void confirm(generation)} onRetrySaving={() => void retryIngestion(generation)}
      onUseSettings={() => useSettings(generation)}
      onPreview={outputFile && onPreviewGenerated ? () => onPreviewGenerated(outputFile) : undefined}
      onAddToTimeline={outputFile && onAddGeneratedToTimeline ? () => {
        void onAddGeneratedToTimeline(outputFile).catch((reason) => setCreatorError(operatorMessage(
          reason instanceof Error ? reason.message : "The generated media could not be added to Timeline.")))
      } : undefined}
      onDismiss={generation.status === "failed" || generation.status === "canceled" || (generation.status === "ready" && generation.output_file_ids.length === 0)
        ? () => hideGeneration(generation.id) : undefined}
    />
  }

  if (preferredOutputUnavailable || !catalog || !model || !capability) return <CreatorLibraryWorkspace
    className="media-creator-workspace"
    creatorOpen={panelOpen}
    onCreatorOpenChange={setPanelOpen}
    creatorNavigation={creatorNavigation}
    creatorDetail={preferredOutputUnavailable ? `${preferredOutputType === "image" ? "Image" : "Video"} unavailable` : "Loading models…"}
    libraryDetail={context.project_id ? "Files collected for this Project" : "Reusable Workspace Files"}
    creator={<div className="media-creator-loading">{preferredOutputUnavailable ? `Connect an ${preferredOutputType}-capable model to use this Creation Action.` : "Loading Media capabilities…"}{creatorError && <p className="media-creator-error" role="alert">{creatorError}</p>}</div>}
    library={renderLibrary?.(new Set(), [])}
  />

  const generationItems = generations.filter(({ id }) => !hiddenRequestIds.has(id)).map((generation) => ({
    id: generation.id,
    status: generation.status === "ready" && generation.output_file_ids.length === 0 ? "failed" as const : generation.status,
    mediaType: generation.output_media_type,
    createdAt: generation.created_at,
    node: generationCard(generation, true),
  }))
  return <>
    <CreatorLibraryWorkspace
      className="media-creator-workspace"
      creatorOpen={panelOpen}
      onCreatorOpenChange={setPanelOpen}
      creatorNavigation={creatorNavigation}
      creatorDetail={model.label}
      libraryDetail={`${libraryFiles.length} Files · ${generations.length} requests${activeEstimate > 0 ? " · generation pending" : ""}`}
      creator={<><MediaCreatorInput
      prompt={prompt} operations={catalog.operations.filter(({ id }) => modes.some((mode) => mode.operation === id))} operation={operation} capability={presentedCapability || capability}
      model={model} models={families} modelFamilyId={family?.id || ""} attachments={visibleAttachments} missingRoles={missing}
      ratio={ratio} resolution={resolution} duration={duration} advanced={advanced}
      files={libraryFiles}
      context={context}
      busy={submitting} disabledReason={disabledReason}
      uploadStatus={referenceUploads ? `Uploading ${referenceUploads === 1 ? "reference" : `${referenceUploads} references`}…` : uploading ? uploadLabel : undefined}
      onPromptChange={setPrompt} onOperationChange={changeOperation}
      onModelChange={changeFamily}
      onRatioChange={setRatio} onResolutionChange={setResolution} onDurationChange={setDuration}
      onAdvancedChange={changeAdvanced}
      onRemoveAttachment={removeReference}
      onOpenLibrary={openLibrary}
      onSwapFrames={swapFrames}
      canSaveReference={visibleAttachments.some(({ fileId }) => fileId)}
      onSaveReference={() => setSaveReferenceOpen(true)}
      onSubmit={() => void createGeneration()}
      />{creatorError && <p className="media-creator-error" role="alert">{creatorError}</p>}</>}
      library={renderLibrary ? renderLibrary(generatedOutputIds, generationItems) : <div className="media-generation-list" aria-label="Media requests">{generations.map((generation) => generationCard(generation))}</div>}
    />
    <input ref={slotUploadRef} hidden multiple type="file" accept={pickerFileAccept} onChange={(event) => { if (event.target.files?.length) receiveFiles(Array.from(event.target.files), pickerRole); event.target.value = "" }} />
    <MediaReferenceLibraryDialog open={libraryOpen} title={pickerSlot?.label} files={libraryFiles} recentFileIds={recentFileIds} savedReferences={compatibleSavedReferences} acceptedMediaTypes={pickerMediaTypes} compatibility={pickerCompatibility} checking={pickerChecking} onOpenChange={changeLibraryOpen} onAdd={(file) => void receiveFile(file, pickerRole)} onAddReference={applySavedReference} onUpload={() => slotUploadRef.current?.click()} />
    <SavedReferenceCreateDialog open={saveReferenceOpen} count={visibleAttachments.filter(({ fileId }) => fileId).length} onOpenChange={setSaveReferenceOpen} onCreate={saveCurrentReference} />
  </>
}
