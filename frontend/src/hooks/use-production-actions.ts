import { useCallback, useState } from "react"
import { toast } from "sonner"

import type { usePlayer } from "@/hooks/use-player"
import { studioApi } from "@/lib/api"
import { playableGenerateResult } from "@/lib/generated-audio"
import { resolveVoice } from "@/lib/voice"
import type { GeneratePayload, GenerateResult, MusicBed, Production, ProductionPart, VentureAsset, VoiceDirectory } from "@/types/domain"

type Player = ReturnType<typeof usePlayer>

export function useProductionActions({ production, music, directory, player, refresh, refreshAssets, closeTool }: {
  production: Production
  music: MusicBed
  directory: VoiceDirectory
  player: Player
  refresh: () => Promise<void>
  refreshAssets: () => Promise<void>
  closeTool: () => void
}) {
  const [previewing, setPreviewing] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [exporting, setExporting] = useState(false)
  const previewKey = `preview:${production.id}:${previewRevision}`
  const playerPlaying = player.state === "playing"
  const productionLoaded = player.source?.key === previewKey
  const productionPlaying = playerPlaying && productionLoaded

  const invalidatePreview = useCallback(() => setPreviewRevision((value) => value + 1), [])

  const settleSuccessfulRender = useCallback(async (
    rawResult: GenerateResult,
    source: { key: string; title: string; subtitle: string },
    success: string,
  ): Promise<GenerateResult> => {
    const result = playableGenerateResult(rawResult)
    invalidatePreview()
    closeTool()

    // The provider call has already succeeded and may already be billed. A
    // stale timeline request must never relabel that completed render as a
    // provider failure or expose a dangerous paid Retry action.
    try {
      await refresh()
    } catch {
      toast.warning("Audio created, but the timeline could not refresh. Reload the page to see it.")
    }

    await player.toggleSource({ ...source, url: result.url, kind: "part" })
    if (result.fidelity && result.fidelity.status !== "pass") {
      toast.warning(`${result.fidelity.message} Review this take before using it.`)
    } else if (result.failures?.length) {
      toast.warning(`${result.failures.length} section${result.failures.length === 1 ? "" : "s"} failed and are missing from the audio.`)
    } else {
      toast.success(`${success}${result.cost !== undefined ? ` · $${result.cost.toFixed(4)}` : ""}`)
    }
    return result
  }, [closeTool, invalidatePreview, player, refresh])

  const mutate = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action()
      if (player.source?.kind === "preview") player.pause()
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
      await player.toggleSource({ key: previewKey, url: result.url, title: production.name, subtitle: music.filename ? "Exact sequence preview with music" : "Exact sequence preview", kind: "preview" })
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

  const generatePart = useCallback(async (payload: GeneratePayload): Promise<GenerateResult> => {
    try {
      const result = await studioApi.generate(payload)
      if (result.needs_confirmation) return result
      return settleSuccessfulRender(result, {
        key: result.id ? `part:${result.id}` : `generated:${Date.now()}`,
        title: `New part in ${production.name}`,
        subtitle: `${resolveVoice(payload.voice, directory).name} · ${result.cost_basis || "estimated cost"}`,
      }, "Part generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed.")
      throw error
    }
  }, [directory, production.name, settleSuccessfulRender])

  const regeneratePart = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<GenerateResult> => {
    try {
      const canonical = (payload.text_raw || payload.text || "").trim()
      if (canonical && canonical !== (part.text || "").trim()) {
        await studioApi.savePartScript(production.id, part.id, canonical)
      }
      const result = await studioApi.regenerate(part.id, payload)
      if (result.needs_confirmation) return result
      return settleSuccessfulRender(result, {
        key: `part:${part.id}`,
        title: `New take · Part ${(part.position ?? 0) + 1}`,
        subtitle: resolveVoice(payload.voice, directory).name,
      }, "New take ready")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The new take failed.")
      throw error
    }
  }, [directory, production.id, settleSuccessfulRender])

  const renderDraft = useCallback(async (part: ProductionPart, payload: GeneratePayload): Promise<GenerateResult> => {
    try {
      const canonical = (payload.text_raw || payload.text || "").trim()
      if (canonical && canonical !== (part.text || "").trim()) {
        await studioApi.savePartScript(production.id, part.id, canonical)
      }
      const result = await studioApi.renderDraft(part.id, payload)
      if (result.needs_confirmation) return result
      return settleSuccessfulRender(result, {
        key: `part:${part.id}`,
        title: `Recorded · Part ${(part.position ?? 0) + 1}`,
        subtitle: resolveVoice(payload.voice, directory).name,
      }, "Draft recorded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The draft could not be recorded.")
      throw error
    }
  }, [directory, production.id, settleSuccessfulRender])

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
  const addSilence = useCallback((seconds: number, insertAt: number | null) => mutate(() => studioApi.addSilence(production.id, seconds, insertAt), "Silence added"), [mutate, production.id])
  const insertAsset = useCallback((asset: VentureAsset, insertAt: number | null) => mutate(() => studioApi.insertAsset(production.id, asset.id, insertAt), "Library audio inserted"), [mutate, production.id])
  const setMusicAsset = useCallback((asset: VentureAsset) => mutate(() => studioApi.setMusic(production.id, { music_of: asset.id }), "Music bed selected"), [mutate, production.id])
  const moveParts = useCallback((ids: number[], targetId: number, targetName: string) => mutate(() => studioApi.moveParts(production.id, ids, targetId), `Moved to ${targetName}`), [mutate, production.id])
  const uploadAsset = useCallback(async (collectionId: number, folder: string, file: File) => {
    await studioApi.uploadAsset(collectionId, file)
    await refreshAssets()
    toast.success(`${file.name} uploaded to ${folder}`)
  }, [refreshAssets])

  return { previewing, exporting, previewKey, playerPlaying, productionLoaded, productionPlaying, invalidatePreview, toggleProduction, exportMp3, generatePart, regeneratePart, renderDraft, movePart, setMusic, duplicatePart, deletePart, editSilence, deleteParts, saveDraft, addSilence, insertAsset, setMusicAsset, moveParts, uploadAsset }
}
