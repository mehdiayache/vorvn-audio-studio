import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { useJobExecution } from "@/hooks/use-job-execution"
import { studioApi } from "@/lib/api"
import { moveSelectionToPosition } from "@/lib/production-order"
import type { DurableJob, GeneratePayload, GenerateResult, MusicBed, PlayerSource, Production, ProductionPart, VentureAsset } from "@/types/domain"

type Player = ReturnType<typeof usePlayer>

export function useProductionActions({ production, music, player, refresh, refreshAssets, preparePlayerSource }: {
  production: Production
  music: MusicBed
  player: Player
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
  preparePlayerSource?: (source: PlayerSource) => Promise<PlayerSource>
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [exportJobId, setExportJobId] = useState<string | null>(production.export_job?.id || null)
  const observedExportJob = useJobExecution<{ url?: string; name?: string; error?: string }>(exportJobId)
  const exportJob = observedExportJob || production.export_job || null
  const reportedExportJob = useRef<string | null>(null)
  const productionFingerprint = JSON.stringify({
    updatedAt: production.updated_at,
    parts: production.parts.filter((part) => part.kind !== "stitch").map((part) => [part.id, part.position, part.revision, part.selected_take_id, part.duration_ms, part.filename, part.missing]),
    music: [music.filename, music.music_of, music.volume, music.start, music.duck, music.fade_in, music.fade_out],
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
    setExportJobId(production.export_job?.id || null)
    reportedExportJob.current = null
  }, [production.id])

  const mutate = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action()
      if (player.source?.kind === "production") player.pause()
      invalidatePreview()
      if (success) toast.success(success)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That change could not be saved.")
      throw error
    }
  }, [invalidatePreview, player, refresh])

  const preview = useCallback(async () => {
    setPreviewing(true)
    try {
      const result = await studioApi.preview(production.id)
      if (!result.url) throw new Error("The preview did not return an audio file.")
      const skippedDrafts = Number(result.skipped_drafts || 0)
      const mixLabel = music.filename ? "with Music Bed" : "narration only"
      const source: PlayerSource = { key: previewKey, url: result.url, title: production.name, subtitle: skippedDrafts ? `Recorded mix · ${skippedDrafts} Draft${skippedDrafts === 1 ? "" : "s"} omitted · ${mixLabel}` : `Exact current mix · ${mixLabel}`, kind: "production" }
      await player.toggleSource(preparePlayerSource ? await preparePlayerSource(source) : source)
      toast.success(skippedDrafts ? `Recorded preview loaded · ${skippedDrafts} Draft${skippedDrafts === 1 ? "" : "s"} omitted` : result.cached ? "Current preview loaded" : "Current preview prepared")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed.")
    } finally {
      setPreviewing(false)
    }
  }, [music.filename, player, preparePlayerSource, previewKey, production])

  const toggleProduction = useCallback(() => {
    if (previewing) return
    if (player.source?.key === previewKey) { void player.toggle(); return }
    player.pause()
    void preview()
  }, [player, preview, previewKey, previewing])

  const exportMp3 = useCallback(async () => {
    try {
      const job = await studioApi.enqueueRender(production.id, "export")
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
    if (["failed", "lost", "cancelled"].includes(exportJob.status)) reportedExportJob.current = exportJob.id
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

  const regeneratePart = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await studioApi.enqueueRegenerate(part.id, payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The new take failed.")
      throw error
    }
  }, [production.id])

  const recordPendingPart = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await studioApi.enqueueRecordPart(part.id, payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The pending Part could not be recorded.")
      throw error
    }
  }, [])

  const renderDraft = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<DurableJob<GenerateResult>> => {
    try {
      return await studioApi.enqueueRenderDraft(part.id, payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The draft could not be recorded.")
      throw error
    }
  }, [production.id])

  const updatePartEditorial = useCallback(async (part: ProductionPart, values: { expected_revision: number; script?: string }) => {
    try {
      await studioApi.savePartEditorial(production.id, part.id, values)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The Part could not be updated.")
      throw error
    }
  }, [production.id])

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

  const setMusic = useCallback((changes: Partial<MusicBed>) => mutate(() => studioApi.setMusic(production.id, changes), "Music settings saved"), [mutate, production.id])
  const duplicatePart = useCallback((part: ProductionPart) => mutate(() => studioApi.duplicatePart(production.id, part.id), "Part duplicated"), [mutate, production.id])
  const deletePart = useCallback((part: ProductionPart) => mutate(() => studioApi.deletePart(production.id, part.id), "Part deleted"), [mutate, production.id])
  const editSilence = useCallback((part: ProductionPart, seconds: number) => mutate(() => studioApi.editSilence(production.id, part.id, seconds), "Silence updated"), [mutate, production.id])
  const setPartEnabled = useCallback((part: ProductionPart, enabled: boolean) => mutate(() => studioApi.setPartEnabled(production.id, part.id, enabled), enabled ? "Part included" : "Part excluded"), [mutate, production.id])
  const deleteParts = useCallback((ids: number[]) => mutate(() => studioApi.deleteParts(production.id, ids), "Parts deleted"), [mutate, production.id])
  const saveDraft = useCallback((payload: Omit<GeneratePayload, "confirmed">) => mutate(() => studioApi.saveDraft(payload), "Draft added"), [mutate])
  const addSilence = useCallback((seconds: number, beforePartId: string | null) => mutate(() => studioApi.addSilence(production.id, seconds, beforePartId), "Silence added"), [mutate, production.id])
  const insertAsset = useCallback((asset: VentureAsset, beforePartId: string | null) => mutate(() => studioApi.insertAsset(production.id, asset.id, beforePartId), "Library audio inserted"), [mutate, production.id])
  const replaceAsset = useCallback((part: ProductionPart, asset: VentureAsset) => mutate(() => studioApi.replaceAsset(production.id, part.id, asset.id), "Venture audio replaced"), [mutate, production.id])
  const setMusicAsset = useCallback((asset: VentureAsset) => mutate(() => studioApi.setMusic(production.id, { music_of: asset.id }), "Music bed selected"), [mutate, production.id])
  const moveParts = useCallback((ids: number[], targetId: number, targetName: string) => mutate(() => studioApi.moveParts(production.id, ids, targetId), `Moved to ${targetName}`), [mutate, production.id])
  const uploadAsset = useCallback(async (collectionId: number, folder: string, file: File) => {
    await studioApi.uploadAsset(collectionId, file)
    await refreshAssets()
    toast.success(`${file.name} uploaded to ${folder}`)
  }, [refreshAssets])

  return { previewing, exporting, exportJob, previewKey, playerPlaying, productionLoaded, productionPlaying, invalidatePreview, toggleProduction, exportMp3, generatePart, recordPendingPart, regeneratePart, renderDraft, updatePartEditorial, movePart, movePartToPosition, movePartsToPosition, setMusic, duplicatePart, deletePart, editSilence, setPartEnabled, deleteParts, saveDraft, addSilence, insertAsset, replaceAsset, setMusicAsset, moveParts, uploadAsset }
}
