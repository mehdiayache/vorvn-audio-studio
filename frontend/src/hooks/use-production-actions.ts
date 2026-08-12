import { useCallback, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { studioApi } from "@/lib/api"
import type { DurableJob, GeneratePayload, GenerateResult, MusicBed, Production, ProductionPart, VentureAsset } from "@/types/domain"

type Player = ReturnType<typeof usePlayer>

export function useProductionActions({ production, music, player, refresh, refreshAssets }: {
  production: Production
  music: MusicBed
  player: Player
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [exporting, setExporting] = useState(false)
  const previewKey = `preview:${production.id}:${previewRevision}`
  const playerPlaying = player.state === "playing"
  const productionLoaded = player.source?.key === previewKey
  const productionPlaying = playerPlaying && productionLoaded

  const invalidatePreview = useCallback(() => setPreviewRevision((value) => value + 1), [])

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
      await player.toggleSource({ key: previewKey, url: result.url, title: production.name, subtitle: music.filename ? "Exact sequence preview with music" : "Exact sequence preview", kind: "production" })
      toast.success(result.cached ? "Current preview loaded" : "Current preview prepared")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed.")
    } finally {
      setPreviewing(false)
    }
  }, [music.filename, player, previewKey, production])

  const toggleProduction = useCallback(() => {
    if (previewing) return
    if (player.source?.key === previewKey) { void player.toggle(); return }
    player.pause()
    void preview()
  }, [player, preview, previewKey, previewing])

  const exportMp3 = useCallback(async () => {
    setExporting(true)
    try {
      const result = await studioApi.stitch(production.id)
      toast.success("Final MP3 created", { action: { label: "Download", onClick: () => { window.location.href = result.url } } })
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.")
    } finally {
      setExporting(false)
    }
  }, [production.id, refresh])

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

  const updatePartEditorial = useCallback(async (part: ProductionPart, values: { expected_revision: number; script?: string; cast_role_id?: string | null }) => {
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

  const setMusic = useCallback((changes: Partial<MusicBed>) => mutate(() => studioApi.setMusic(production.id, changes), "Music settings saved"), [mutate, production.id])
  const duplicatePart = useCallback((part: ProductionPart) => mutate(() => studioApi.duplicatePart(production.id, part.id), "Part duplicated"), [mutate, production.id])
  const deletePart = useCallback((part: ProductionPart) => mutate(() => studioApi.deletePart(production.id, part.id), "Part deleted"), [mutate, production.id])
  const editSilence = useCallback((part: ProductionPart, seconds: number) => mutate(() => studioApi.editSilence(production.id, part.id, seconds), "Silence updated"), [mutate, production.id])
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

  return { previewing, exporting, previewKey, playerPlaying, productionLoaded, productionPlaying, invalidatePreview, toggleProduction, exportMp3, generatePart, recordPendingPart, regeneratePart, renderDraft, updatePartEditorial, movePart, setMusic, duplicatePart, deletePart, editSilence, deleteParts, saveDraft, addSilence, insertAsset, replaceAsset, setMusicAsset, moveParts, uploadAsset }
}
