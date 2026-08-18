import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { useJobExecution } from "@/hooks/use-job-execution"
import { studioApi } from "@/lib/api"
import { moveSelectionToPosition } from "@/lib/production-order"
import type { DurableJob, GeneratePayload, GenerateResult, PartEditorialUpdate, PlayerSource, Production, ProductionPart, SoundScene, SoundSceneClip, SoundSceneDocument, VentureAsset } from "@/types/domain"

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

  const mutate = useCallback(async <Result,>(action: () => Promise<Result>, success?: string, announce = false): Promise<Result> => {
    if (feedbackMode === "inline") {
      if (mutationFeedbackTimer.current !== null) window.clearTimeout(mutationFeedbackTimer.current)
      setMutationStatus("saving")
    }
    try {
      const result = await action()
      if (player.source?.kind === "production") player.pause()
      invalidatePreview()
      if (success && (feedbackMode === "toast" || announce)) toast.success(success)
      await refresh()
      if (feedbackMode === "inline") {
        setMutationStatus("saved")
        mutationFeedbackTimer.current = window.setTimeout(() => setMutationStatus("idle"), 1_800)
      }
      return result
    } catch (error) {
      if (feedbackMode === "inline") setMutationStatus("idle")
      toast.error(error instanceof Error ? error.message : "That change could not be saved.")
      throw error
    }
  }, [feedbackMode, invalidatePreview, player, refresh])

  const preview = useCallback(async () => {
    setPreviewing(true)
    try {
      const result = await studioApi.preview(production.id)
      if (!result.url) throw new Error("The preview did not return an audio file.")
      const music = soundScene.resolved.tracks.find((track) => track.kind === "music")
      const mixLabel = music?.clips.length && !music.muted ? "with Music" : "voice only"
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
    void mutate(() => studioApi.reorder(production.id, order), `Part moved ${direction < 0 ? "up" : "down"}`)
  }, [mutate, production.id, production.parts])

  const movePartToPosition = useCallback(async (part: ProductionPart, requestedPosition: number) => {
    const order = production.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const from = order.indexOf(part.id)
    const to = Math.max(0, Math.min(order.length - 1, Math.round(requestedPosition) - 1))
    if (from < 0 || from === to) return
    order.splice(to, 0, ...order.splice(from, 1))
    await mutate(() => studioApi.reorder(production.id, order), `Part moved to position ${to + 1}`)
  }, [mutate, production.id, production.parts])

  const movePartsToPosition = useCallback(async (ids: number[], requestedPosition: number) => {
    const order = production.parts.filter((item) => item.kind !== "stitch").map((item) => item.id)
    const selectedCount = order.filter((id) => ids.includes(id)).length
    const position = Math.max(1, Math.min(order.length - selectedCount + 1, Math.round(requestedPosition)))
    const next = moveSelectionToPosition(order, ids, position)
    if (next.every((id, index) => id === order[index])) return
    await mutate(() => studioApi.reorder(production.id, next), `${selectedCount} Part${selectedCount === 1 ? "" : "s"} moved to position ${position}`)
  }, [mutate, production.id, production.parts])

  const updateSoundScene = useCallback((document: SoundSceneDocument) => mutate(
    () => studioApi.updateSoundScene(production.id, soundScene.revision, document),
    "Sound Scene saved",
  ), [mutate, production.id, soundScene.revision])
  const undoSoundScene = useCallback(() => mutate(
    () => studioApi.undoSoundScene(production.id), "Sound Scene undone",
  ), [mutate, production.id])
  const redoSoundScene = useCallback(() => mutate(
    () => studioApi.redoSoundScene(production.id), "Sound Scene redone",
  ), [mutate, production.id])
  const duplicatePart = useCallback((part: ProductionPart) => mutate(() => studioApi.duplicatePart(production.id, part.id), "Part duplicated"), [mutate, production.id])
  const deletePart = useCallback((part: ProductionPart) => mutate(() => studioApi.deletePart(production.id, part.id), "Part permanently deleted", true), [mutate, production.id])
  const editSilence = useCallback((part: ProductionPart, seconds: number) => mutate(() => studioApi.editSilence(production.id, part.id, seconds), "Silence updated"), [mutate, production.id])
  const setPartEnabled = useCallback((part: ProductionPart, enabled: boolean) => mutate(() => studioApi.setPartEnabled(production.id, part.id, enabled), enabled ? "Part included" : "Part excluded"), [mutate, production.id])
  const deleteParts = useCallback((ids: number[]) => mutate(() => studioApi.deleteParts(production.id, ids), "Parts permanently deleted", true), [mutate, production.id])
  const saveDraft = useCallback(async (payload: Omit<GeneratePayload, "confirmed">): Promise<void> => {
    await mutate(() => studioApi.saveDraft(payload), "Draft added")
  }, [mutate])
  const addSilence = useCallback((seconds: number, beforePartId: string | null) => mutate(() => studioApi.addSilence(production.id, seconds, beforePartId), "Silence added"), [mutate, production.id])
  const insertAsset = useCallback((asset: VentureAsset, beforePartId: string | null) => mutate(() => studioApi.insertAsset(production.id, asset.id, beforePartId), "Library audio inserted"), [mutate, production.id])
  const replaceAsset = useCallback((part: ProductionPart, asset: VentureAsset) => mutate(() => studioApi.replaceAsset(production.id, part.id, asset.id), "Venture audio replaced"), [mutate, production.id])
  const setMusicAsset = useCallback((asset: VentureAsset) => {
    const existingTrack = soundScene.document.tracks.find((track) => track.kind === "music")
    const existing = existingTrack?.clips[0]
    const clip: SoundSceneClip = existing ? {
      ...existing, asset_id: asset.id, asset_version_id: null,
    } : {
      id: crypto.randomUUID(), asset_id: asset.id, asset_version_id: null,
      start_ms: 0, duration_ms: null, source_offset_ms: 0,
      gain: .1, fade_in_ms: 2_000, fade_out_ms: 4_000,
      loop: true, ducking: true,
      anchor: { kind: "absolute", position_ms: 0 },
    }
    const document: SoundSceneDocument = {
      version: 1,
      tracks: existingTrack
        ? soundScene.document.tracks.map((track) => track.id === existingTrack.id ? { ...track, clips: [clip] } : track)
        : [...soundScene.document.tracks, { id: "music", kind: "music", name: "Music", volume: 1, muted: false, clips: [clip] }],
    }
    return updateSoundScene(document)
  }, [soundScene.document.tracks, updateSoundScene])
  const removeMusic = useCallback(() => updateSoundScene({
    version: 1,
    tracks: soundScene.document.tracks.map((track) => track.kind === "music" ? { ...track, clips: [] } : track),
  }), [soundScene.document.tracks, updateSoundScene])
  const moveParts = useCallback((ids: number[], targetId: number, targetName: string) => mutate(() => studioApi.moveParts(production.id, ids, targetId), `Moved to ${targetName}`, true), [mutate, production.id])
  const uploadAsset = useCallback(async (collectionId: number, folder: string, file: File) => {
    await studioApi.uploadAsset(collectionId, file)
    await refreshAssets()
    toast.success(`${file.name} uploaded to ${folder}`)
  }, [refreshAssets])

  return { previewing, exporting, exportJob, previewKey, playerPlaying, productionLoaded, productionPlaying, mutationStatus, invalidatePreview, toggleProduction, exportMp3, generatePart, recordPendingPart, updatePartEditorial, movePart, movePartToPosition, movePartsToPosition, updateSoundScene, undoSoundScene, redoSoundScene, duplicatePart, deletePart, editSilence, setPartEnabled, deleteParts, saveDraft, addSilence, insertAsset, replaceAsset, setMusicAsset, removeMusic, moveParts, uploadAsset }
}
