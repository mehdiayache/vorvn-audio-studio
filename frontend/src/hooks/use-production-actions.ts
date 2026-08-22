import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useAsyncAction } from "@/hooks/use-async-action"
import { audibleAudioClips } from "@/features/sound-scene/sound-scene-audibility"
import { studioApi } from "@/lib/api"
import { moveSelectionToPosition } from "@/lib/production-order"
import type { AudioAssetCategory, AudioAssetScope, CatalogKeepResult, CatalogSound, DurableJob, GeneratePayload, GenerateResult, GeneratedKeepResult, PartEditorialUpdate, PlayerSource, Production, ProductionPart, SoundScene, SoundSceneDocument, VentureAsset } from "@/types/domain"

type Player = ReturnType<typeof usePlayer>
export type ProductionMutationStatus = "idle" | "saving" | "saved"
const activeJob = (job: DurableJob<unknown> | null | undefined) => Boolean(job && ["queued", "running", "retrying"].includes(job.status))

export function useProductionActions({ production, soundScene, player, refresh, refreshAssets, preparePlayerSource, feedbackMode = "toast" }: {
  production: Production
  soundScene: SoundScene
  player: Player
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
  preparePlayerSource?: (source: PlayerSource) => Promise<PlayerSource>
  feedbackMode?: "toast" | "inline"
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [mutationStatus, setMutationStatus] = useState<ProductionMutationStatus>("idle")
  const activeMutationCount = useRef(0)
  const mutationActions = useAsyncAction<string>()
  const mutationFeedbackTimer = useRef<number | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(activeJob(production.export_job) ? production.export_job?.id || null : null)
  const observedExportJob = useJobExecution<{ url?: string; name?: string; error?: string }>(exportJobId)
  const exportJob = observedExportJob || (activeJob(production.export_job) ? production.export_job ?? null : null)
  const reportedExportJob = useRef<string | null>(null)
  const productionFingerprint = JSON.stringify({
    updatedAt: production.updated_at,
    parts: production.parts.filter((part) => part.kind !== "stitch").map((part) => [part.id, part.position, part.revision, part.clip_id, part.duration_ms, part.filename, part.missing]),
    soundScene: [soundScene.revision, soundScene.resolved.signature],
  })
  const previousFingerprint = useRef(productionFingerprint)
  const previewKey = `preview:${production.id}:${previewRevision}`
  const playerPlaying = player.state === "playing"
  const productionLoaded = player.source?.key === previewKey
  const productionPlaying = playerPlaying && productionLoaded

  const invalidatePreview = useCallback(() => setPreviewRevision((value) => value + 1), [])

  useEffect(() => {
    if (previousFingerprint.current === productionFingerprint) return
    previousFingerprint.current = productionFingerprint
    if (player.source?.kind === "production") invalidatePreview()
  }, [invalidatePreview, player.source?.kind, productionFingerprint])

  useEffect(() => {
    const historical = production.export_job || null
    setExportJobId(activeJob(historical) ? historical?.id || null : null)
    reportedExportJob.current = activeJob(historical) ? null : historical?.id || null
  }, [production.id])

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
        if (player.source?.kind === "production") player.pause()
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
      const result = await studioApi.preview(production.id)
      if (!result.url) throw new Error("The preview did not return an audio file.")
      const mixLabel = audibleAudioClips(soundScene).length ? "with Audio" : "voice only"
      const source: PlayerSource = { key: previewKey, url: result.url, title: production.name, subtitle: `Current audible mix · ${mixLabel}`, kind: "production" }
      await player.toggleSource(preparePlayerSource ? await preparePlayerSource(source) : source)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed.")
    } finally {
      setPreviewing(false)
    }
  }, [player, preparePlayerSource, previewKey, production, soundScene.resolved.tracks])

  const toggleProduction = useCallback(() => {
    if (previewing) return
    if (player.source?.key === previewKey) { void player.toggle(); return }
    player.pause()
    void preview()
  }, [player, preview, previewKey, previewing])

  const exportMp3 = useCallback(async (allowIncomplete = false) => {
    try {
      const job = await studioApi.enqueueRender(production.id, "export", allowIncomplete)
      setExportJobId(job.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.")
    }
  }, [production.id])

  useEffect(() => {
    if (!exportJob || reportedExportJob.current === exportJob.id) return
    if (exportJob.status === "ok" || exportJob.status === "warning") {
      reportedExportJob.current = exportJob.id
      toast.success("Final MP3 created", exportJob.result.url ? { action: { label: "Download", onClick: () => { window.location.href = exportJob.result.url! } } } : undefined)
      void refresh()
    }
    if (["failed", "lost", "cancelled"].includes(exportJob.status)) {
      reportedExportJob.current = exportJob.id
      toast.error(exportJob.error || exportJob.detail || exportJob.result.error || "Final MP3 could not be created.")
    }
  }, [exportJob, refresh])
  const exporting = Boolean(exportJob && ["queued", "running", "retrying"].includes(exportJob.status))

  const generatePart = useCallback(async (payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await studioApi.enqueueGenerate(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.")
      throw error
    }
  }, [])

  const recordPendingPart = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await studioApi.enqueueRecordPart(part.id, payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The pending Part could not be recorded.")
      throw error
    }
  }, [])

  const updatePartEditorial = useCallback(async (part: ProductionPart, values: PartEditorialUpdate) => {
    try {
      await studioApi.savePartEditorial(production.id, part.id, values)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Part could not be updated.")
      throw error
    }
  }, [production.id, refresh])

  const movePart = useCallback((part: ProductionPart, direction: -1 | 1) => {
    const order = production.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const index = order.indexOf(part.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    void mutate(`part:${part.id}:move`, () => studioApi.reorder(production.id, order), `Part moved ${direction < 0 ? "up" : "down"}`)
  }, [mutate, production.id, production.parts])

  const movePartToPosition = useCallback(async (part: ProductionPart, requestedPosition: number) => {
    const order = production.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const from = order.indexOf(part.id)
    const to = Math.max(0, Math.min(order.length - 1, Math.round(requestedPosition) - 1))
    if (from < 0 || from === to) return
    order.splice(to, 0, ...order.splice(from, 1))
    await mutate(`part:${part.id}:move`, () => studioApi.reorder(production.id, order), `Part moved to position ${to + 1}`)
  }, [mutate, production.id, production.parts])

  const movePartsToPosition = useCallback(async (ids: number[], requestedPosition: number) => {
    const order = production.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const selectedCount = order.filter((id) => ids.includes(id)).length
    const position = Math.max(1, Math.min(order.length - selectedCount + 1, Math.round(requestedPosition)))
    const next = moveSelectionToPosition(order, ids, position)
    if (next.every((id, index) => id === order[index])) return
    await mutate("parts:move", () => studioApi.reorder(production.id, next), `${selectedCount} Part${selectedCount === 1 ? "" : "s"} moved to position ${position}`)
  }, [mutate, production.id, production.parts])

  const updateSoundScene = useCallback((document: SoundSceneDocument, expectedRevision: number) => mutate(
    `sound-scene:save:${expectedRevision}`, () => studioApi.updateSoundScene(production.id, expectedRevision, document),
    "Sound Scene saved",
  ), [mutate, production.id])
  const undoSoundScene = useCallback(() => mutate(
    "sound-scene:undo", () => studioApi.undoSoundScene(production.id), "Sound Scene undone",
  ), [mutate, production.id])
  const redoSoundScene = useCallback(() => mutate(
    "sound-scene:redo", () => studioApi.redoSoundScene(production.id), "Sound Scene redone",
  ), [mutate, production.id])
  const duplicatePart = useCallback((part: ProductionPart) => mutate(`part:${part.id}:duplicate`, () => studioApi.duplicatePart(production.id, part.id), "Part duplicated"), [mutate, production.id])
  const deletePart = useCallback((part: ProductionPart) => mutate(`part:${part.id}:delete`, () => studioApi.deletePart(production.id, part.id), "Part permanently deleted", true), [mutate, production.id])
  const editSilence = useCallback((part: ProductionPart, seconds: number) => mutate(`part:${part.id}:silence`, () => studioApi.editSilence(production.id, part.id, seconds), "Silence updated"), [mutate, production.id])
  const setPartEnabled = useCallback((part: ProductionPart, enabled: boolean) => mutate(`part:${part.id}:enabled`, () => studioApi.setPartEnabled(production.id, part.id, enabled), enabled ? "Part included" : "Part excluded"), [mutate, production.id])
  const deleteParts = useCallback((ids: number[]) => mutate("parts:delete", () => studioApi.deleteParts(production.id, ids), "Parts permanently deleted", true), [mutate, production.id])
  const saveDraft = useCallback(async (payload: Omit<GeneratePayload, "confirmed">): Promise<void> => {
    await mutate("production:add-speech", () => studioApi.saveDraft(payload), "Draft added")
  }, [mutate])
  const addSilence = useCallback((seconds: number, beforePartId: string | null) => mutate("production:add-silence", () => studioApi.addSilence(production.id, seconds, beforePartId), "Silence added"), [mutate, production.id])
  const insertAsset = useCallback((asset: VentureAsset, beforePartId: string | null) => mutate("production:add-asset", () => studioApi.insertAsset(production.id, asset.id, beforePartId), "Library audio inserted"), [mutate, production.id])
  const replaceAsset = useCallback((part: ProductionPart, asset: VentureAsset) => mutate(`part:${part.id}:replace`, () => studioApi.replaceAsset(production.id, part.id, asset.id), "Venture audio replaced"), [mutate, production.id])
  const moveParts = useCallback((ids: number[], targetId: number, targetName: string) => mutate("parts:move-production", () => studioApi.moveParts(production.id, ids, targetId), `Moved to ${targetName}`, true), [mutate, production.id])
  const uploadAsset = useCallback(async (collectionId: number, folder: string, details: {
    name: string
    category: string
    scope: "venture" | "studio"
    tags: string[]
    file: File
  }): Promise<VentureAsset> => {
    return mutationActions.run("asset:upload", async () => {
      const uploaded = await studioApi.uploadAsset(collectionId, details.file, details)
      await refreshAssets()
      toast.success(`${details.name} added to the Audio Library`)
      return uploaded as VentureAsset
    })
  }, [mutationActions.run, refreshAssets])

  const keepFreesound = useCallback(async (collectionId: number, details: {
    result: CatalogSound
    name: string
    category: AudioAssetCategory
    scope: AudioAssetScope
    tags: string[]
  }): Promise<CatalogKeepResult> => mutationActions.run(
    `asset:keep:freesound:${details.result.external_id}`, async () => {
      const kept = await studioApi.keepFreesound({
        collection_id: collectionId,
        external_id: details.result.external_id,
        name: details.name,
        category: details.category,
        scope: details.scope,
        tags: details.tags,
      })
      await refreshAssets()
      toast.success(kept.duplicate ? `${details.name} is already in the Audio Library` : `${details.name} kept in the Audio Library`)
      return kept
    }), [mutationActions.run, refreshAssets])

  const keepGeneratedAudio = useCallback(async (collectionId: number, details: {
    candidateId: string
    name: string
    category: AudioAssetCategory
    scope: AudioAssetScope
    tags: string[]
  }): Promise<GeneratedKeepResult> => mutationActions.run(
    `asset:keep:generated:${details.candidateId}`, async () => {
      const kept = await studioApi.keepGeneratedAudio(details.candidateId, {
        collection_id: collectionId,
        name: details.name,
        category: details.category,
        scope: details.scope,
        tags: details.tags,
      })
      await refreshAssets()
      toast.success(kept.duplicate ? `${details.name} is already in the Audio Library` : `${details.name} kept in the Audio Library`)
      return kept
    }), [mutationActions.run, refreshAssets])

  return { previewing, exporting, exportJob, previewKey, playerPlaying, productionLoaded, productionPlaying, mutationStatus, isActionPending: mutationActions.isPending, invalidatePreview, toggleProduction, exportMp3, generatePart, recordPendingPart, updatePartEditorial, movePart, movePartToPosition, movePartsToPosition, updateSoundScene, undoSoundScene, redoSoundScene, duplicatePart, deletePart, editSilence, setPartEnabled, deleteParts, saveDraft, addSilence, insertAsset, replaceAsset, moveParts, uploadAsset, keepFreesound, keepGeneratedAudio }
}
