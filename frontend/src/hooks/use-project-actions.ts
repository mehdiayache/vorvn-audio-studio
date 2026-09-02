import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useAsyncAction } from "@/hooks/use-async-action"
import { audibleAudioClips } from "@/features/sound-scene/sound-scene-audibility"
import { originsApi } from "@/lib/api"
import { moveSelectionToPosition } from "@/lib/project-order"
import type { AudioFileCategory, CatalogKeepResult, CatalogSound, DurableJob, GeneratePayload, GenerateResult, GeneratedKeepResult, PartEditorialUpdate, PlayerSource, Project, ProjectPart, SoundScene, SoundSceneDocument, WorkspaceFile } from "@/types/domain"

type Player = ReturnType<typeof usePlayer>
export type ProjectMutationStatus = "idle" | "saving" | "saved"
const activeJob = (job: DurableJob<unknown> | null | undefined) => Boolean(job && ["queued", "running", "retrying"].includes(job.status))
type ExportFormat = "mp3" | "mp4"

function jobExportFormat(job: DurableJob<{ name?: string }> | null | undefined): ExportFormat | null {
  const detail = `${job?.detail || ""} ${job?.result.name || ""}`.toLowerCase()
  if (detail.includes("video") || detail.includes("mp4")) return "mp4"
  if (detail.includes("audio") || detail.includes("mp3")) return "mp3"
  return null
}

export function useProjectActions({ project, soundScene, player, refresh, refreshFiles, preparePlayerSource, feedbackMode = "toast" }: {
  project: Project
  soundScene: SoundScene
  player: Player
  refresh: () => Promise<void>
  refreshFiles: () => Promise<void>
  preparePlayerSource?: (source: PlayerSource) => Promise<PlayerSource>
  feedbackMode?: "toast" | "inline"
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [mutationStatus, setMutationStatus] = useState<ProjectMutationStatus>("idle")
  const activeMutationCount = useRef(0)
  const mutationActions = useAsyncAction<string>()
  const mutationFeedbackTimer = useRef<number | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(activeJob(project.export_job) ? project.export_job?.id || null : null)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(activeJob(project.export_job) ? jobExportFormat(project.export_job) : null)
  const observedExportJob = useJobExecution<{ url?: string; name?: string; error?: string }>(exportJobId)
  const exportJob = observedExportJob || (activeJob(project.export_job) ? project.export_job ?? null : null)
  const reportedExportJob = useRef<string | null>(null)
  const projectFingerprint = JSON.stringify({
    updatedAt: project.updated_at,
    parts: project.parts.filter((part) => part.kind !== "stitch").map((part) => [part.id, part.position, part.revision, part.clip_id, part.duration_ms, part.filename, part.missing]),
    soundScene: [soundScene.revision, soundScene.resolved.signature],
  })
  const previousFingerprint = useRef(projectFingerprint)
  const previewKey = `preview:${project.id}:${previewRevision}`
  const playerPlaying = player.state === "playing"
  const projectLoaded = player.source?.key === previewKey
  const projectPlaying = playerPlaying && projectLoaded

  const invalidatePreview = useCallback(() => setPreviewRevision((value) => value + 1), [])

  useEffect(() => {
    if (previousFingerprint.current === projectFingerprint) return
    previousFingerprint.current = projectFingerprint
    if (player.source?.kind === "project") invalidatePreview()
  }, [invalidatePreview, player.source?.kind, projectFingerprint])

  useEffect(() => {
    const historical = project.export_job || null
    setExportJobId(activeJob(historical) ? historical?.id || null : null)
    setExportingFormat(activeJob(historical) ? jobExportFormat(historical) : null)
    reportedExportJob.current = activeJob(historical) ? null : historical?.id || null
  }, [project.id])

  useEffect(() => () => {
    if (mutationFeedbackTimer.current !== null) window.clearTimeout(mutationFeedbackTimer.current)
  }, [])

  const mutate = useCallback(async <Result,>(key: string, action: () => Promise<Result>, success?: string, announce = false): Promise<Result> => {
    return mutationActions.run(key, async () => {
      if (feedbackMode === "inline") {
        activeMutationCount.current += 1
        if (mutationFeedbackTimer.current !== null) window.clearTimeout(mutationFeedbackTimer.current)
        setMutationStatus("saving")
      }
      let saved = false
      try {
        const result = await action()
        if (player.source?.kind === "project") player.pause()
        invalidatePreview()
        if (success && (feedbackMode === "toast" || announce)) toast.success(success)
        await refresh()
        saved = true
        return result
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That change could not be saved.")
        throw error
      } finally {
        if (feedbackMode === "inline") {
          activeMutationCount.current = Math.max(0, activeMutationCount.current - 1)
          if (activeMutationCount.current === 0) {
            setMutationStatus(saved ? "saved" : "idle")
            if (saved) mutationFeedbackTimer.current = window.setTimeout(() => setMutationStatus("idle"), 1_800)
          }
        }
      }
    })
  }, [feedbackMode, invalidatePreview, mutationActions.run, player, refresh])

  const preview = useCallback(async () => {
    setPreviewing(true)
    try {
      const result = await originsApi.preview(project.id)
      if (!result.url) throw new Error("The preview did not return an audio file.")
      const mixLabel = audibleAudioClips(soundScene).length ? "with Audio" : "voice only"
      const source: PlayerSource = { key: previewKey, url: result.url, title: project.name, subtitle: `Current audible mix · ${mixLabel}`, kind: "project" }
      await player.toggleSource(preparePlayerSource ? await preparePlayerSource(source) : source)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed.")
    } finally {
      setPreviewing(false)
    }
  }, [player, preparePlayerSource, previewKey, project, soundScene.resolved.tracks])

  const toggleProject = useCallback(() => {
    if (previewing) return
    if (player.source?.key === previewKey) { void player.toggle(); return }
    player.pause()
    void preview()
  }, [player, preview, previewKey, previewing])

  const exportProject = useCallback(async (format: ExportFormat, allowIncomplete = false) => {
    setExportingFormat(format)
    try {
      const job = await originsApi.enqueueRender(project.id, "export", allowIncomplete, format)
      setExportJobId(job.id)
    } catch (error) {
      setExportingFormat(null)
      toast.error(error instanceof Error ? error.message : "Export failed.")
    }
  }, [project.id])

  useEffect(() => {
    if (!exportJob || reportedExportJob.current === exportJob.id) return
    if (exportJob.status === "ok" || exportJob.status === "warning") {
      reportedExportJob.current = exportJob.id
      const format = exportJob.result.name?.toLowerCase().endsWith(".mp4") ? "MP4" : "MP3"
      setExportingFormat(null)
      toast.success(`${format} ready`, { description: "Download it from the persistent Export result." })
      void refresh()
    }
    if (["failed", "lost", "cancelled"].includes(exportJob.status)) {
      reportedExportJob.current = exportJob.id
      setExportingFormat(null)
      toast.error(exportJob.error || exportJob.detail || exportJob.result.error || "The export could not be created.")
    }
  }, [exportJob, refresh])
  const exporting = Boolean(exportJob && ["queued", "running", "retrying"].includes(exportJob.status))

  const generatePart = useCallback(async (payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await originsApi.enqueueGenerate(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.")
      throw error
    }
  }, [])

  const recordPendingPart = useCallback(async (part: ProjectPart, payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await originsApi.enqueueRecordPart(part.id, payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The pending Part could not be recorded.")
      throw error
    }
  }, [])

  const updatePartEditorial = useCallback(async (part: ProjectPart, values: PartEditorialUpdate) => {
    try {
      await originsApi.savePartEditorial(project.id, part.id, values)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Part could not be updated.")
      throw error
    }
  }, [project.id, refresh])

  const movePart = useCallback((part: ProjectPart, direction: -1 | 1) => {
    const order = project.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const index = order.indexOf(part.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    void mutate(`part:${part.id}:move`, () => originsApi.reorder(project.id, order), `Part moved ${direction < 0 ? "up" : "down"}`)
  }, [mutate, project.id, project.parts])

  const movePartToPosition = useCallback(async (part: ProjectPart, requestedPosition: number) => {
    const order = project.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const from = order.indexOf(part.id)
    const to = Math.max(0, Math.min(order.length - 1, Math.round(requestedPosition) - 1))
    if (from < 0 || from === to) return
    order.splice(to, 0, ...order.splice(from, 1))
    await mutate(`part:${part.id}:move`, () => originsApi.reorder(project.id, order), `Part moved to position ${to + 1}`)
  }, [mutate, project.id, project.parts])

  const movePartsToPosition = useCallback(async (ids: number[], requestedPosition: number) => {
    const order = project.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const selectedCount = order.filter((id) => ids.includes(id)).length
    const position = Math.max(1, Math.min(order.length - selectedCount + 1, Math.round(requestedPosition)))
    const next = moveSelectionToPosition(order, ids, position)
    if (next.every((id, index) => id === order[index])) return
    await mutate("parts:move", () => originsApi.reorder(project.id, next), `${selectedCount} Part${selectedCount === 1 ? "" : "s"} moved to position ${position}`)
  }, [mutate, project.id, project.parts])

  const updateSoundScene = useCallback((document: SoundSceneDocument, expectedRevision: number, mutationKind: "operator" | "derived_visual_audio" = "operator") => {
    if (mutationKind === "derived_visual_audio") {
      return originsApi.updateSoundScene(project.id, expectedRevision, document, mutationKind).then(async (scene) => {
        invalidatePreview()
        await refresh()
        return scene
      })
    }
    return mutate(
      `sound-scene:save:${expectedRevision}`, () => originsApi.updateSoundScene(project.id, expectedRevision, document, mutationKind),
      "Timeline saved",
    )
  }, [invalidatePreview, mutate, project.id, refresh])
  const undoSoundScene = useCallback(() => mutate(
    "sound-scene:undo", () => originsApi.undoSoundScene(project.id), "Timeline undone",
  ), [mutate, project.id])
  const redoSoundScene = useCallback(() => mutate(
    "sound-scene:redo", () => originsApi.redoSoundScene(project.id), "Timeline redone",
  ), [mutate, project.id])
  const duplicatePart = useCallback((part: ProjectPart) => mutate(`part:${part.id}:duplicate`, () => originsApi.duplicatePart(project.id, part.id), "Part duplicated"), [mutate, project.id])
  const deletePart = useCallback((part: ProjectPart) => mutate(`part:${part.id}:delete`, () => originsApi.deletePart(project.id, part.id), "Part permanently deleted", true), [mutate, project.id])
  const editSilence = useCallback((part: ProjectPart, seconds: number) => mutate(`part:${part.id}:silence`, () => originsApi.editSilence(project.id, part.id, seconds), "Silence updated"), [mutate, project.id])
  const setPartEnabled = useCallback((part: ProjectPart, enabled: boolean) => mutate(`part:${part.id}:enabled`, () => originsApi.setPartEnabled(project.id, part.id, enabled), enabled ? "Part included" : "Part excluded"), [mutate, project.id])
  const deleteParts = useCallback((ids: number[]) => mutate("parts:delete", () => originsApi.deleteParts(project.id, ids), "Parts permanently deleted", true), [mutate, project.id])
  const saveDraft = useCallback(async (payload: Omit<GeneratePayload, "confirmed">): Promise<void> => {
    await mutate("project:add-speech", () => originsApi.saveDraft(payload), "Draft added")
  }, [mutate])
  const addSilence = useCallback((seconds: number, beforePartId: string | null) => mutate("project:add-silence", () => originsApi.addSilence(project.id, seconds, beforePartId), "Silence added"), [mutate, project.id])
  const insertFile = useCallback((file: WorkspaceFile, beforePartId: string | null) => mutate("project:add-file", () => originsApi.insertFile(project.id, file.id, beforePartId), "Library audio inserted"), [mutate, project.id])
  const replaceFile = useCallback((part: ProjectPart, file: WorkspaceFile) => mutate(`part:${part.id}:replace`, () => originsApi.replaceFile(project.id, part.id, file.id), "Workspace audio replaced"), [mutate, project.id])
  const moveParts = useCallback((ids: number[], targetId: number, targetName: string) => mutate("parts:move-project", () => originsApi.moveParts(project.id, ids, targetId), `Moved to ${targetName}`, true), [mutate, project.id])
  const uploadFile = useCallback(async (_category: string, details: {
    name: string
    category: AudioFileCategory | null
    tags: string[]
    file: File
  }): Promise<WorkspaceFile> => {
    return mutationActions.run("file:upload", async () => {
      const uploaded = await originsApi.uploadAudiovisualProjectFile(
        project.id, details.file, details)
      await refreshFiles()
      toast.success(`${details.name} added to the File Library`)
      return uploaded as WorkspaceFile
    })
  }, [mutationActions.run, project.workspace_id, refreshFiles])

  const updateFile = useCallback(async (file: WorkspaceFile, details: {
    name: string
    category: AudioFileCategory | null
    tags: string[]
  }): Promise<WorkspaceFile> => mutationActions.run(
    `file:update:${file.id}`, async () => {
      const updated = await originsApi.updateFile(file.id, details)
      await refreshFiles()
      toast.success(`${details.name} updated`)
      return updated
    }), [mutationActions.run, refreshFiles])

  const keepFreesound = useCallback(async (details: {
    result: CatalogSound
    name: string
    category: AudioFileCategory | null
    tags: string[]
  }): Promise<CatalogKeepResult> => mutationActions.run(
    `file:keep:freesound:${details.result.external_id}`, async () => {
      const payload = {
        external_id: details.result.external_id,
        name: details.name,
        category: details.category,
        tags: details.tags,
      }
      const kept = await originsApi.keepFreesoundInProject(
        project.id, payload)
      await refreshFiles()
      toast.success(kept.duplicate ? `${details.name} is already in the File Library` : `${details.name} saved to the File Library`)
      return kept
    }), [mutationActions.run, project.workspace_id, refreshFiles])

  const keepGeneratedAudio = useCallback(async (details: {
    candidateId: string
    name: string
    category: AudioFileCategory
    tags: string[]
  }): Promise<GeneratedKeepResult> => mutationActions.run(
    `file:keep:generated:${details.candidateId}`, async () => {
      const payload = {
        name: details.name,
        category: details.category,
        tags: details.tags,
      }
      const kept = await originsApi.keepGeneratedAudioInProject(
        details.candidateId, project.id, payload)
      await refreshFiles()
      toast.success(kept.duplicate ? `${details.name} is already in the File Library` : `${details.name} saved to the File Library`)
      return kept
    }), [mutationActions.run, project.workspace_id, refreshFiles])

  return { previewing, exporting, exportingFormat, exportJob, previewKey, playerPlaying, projectLoaded, projectPlaying, mutationStatus, isActionPending: mutationActions.isPending, invalidatePreview, toggleProject, exportProject, generatePart, recordPendingPart, updatePartEditorial, movePart, movePartToPosition, movePartsToPosition, updateSoundScene, undoSoundScene, redoSoundScene, duplicatePart, deletePart, editSilence, setPartEnabled, deleteParts, saveDraft, addSilence, insertFile, replaceFile, moveParts, uploadFile, updateFile, keepFreesound, keepGeneratedAudio }
}
