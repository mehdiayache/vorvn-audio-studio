import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { ProductionPart, Take, Transcript, TranscriptSummary } from "@/types/domain"

export type CaptionConfirmation = { kind: "transcribe" | "translate"; estimate: number; target?: string }

export function usePartDetailData(productionId: number, part: ProductionPart | null, onChanged: () => Promise<void>) {
  const [takes, setTakes] = useState<Take[]>([])
  const [captions, setCaptions] = useState<TranscriptSummary[]>([])
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [loading, setLoading] = useState(false)
  const [captionBusy, setCaptionBusy] = useState<"transcribe" | "translate" | null>(null)
  const [captionConfirmation, setCaptionConfirmation] = useState<CaptionConfirmation | null>(null)
  const [message, setMessage] = useState("")

  const reload = useCallback(async (activePart: ProductionPart, preferId?: number) => {
    const [takeResult, captionResult] = await Promise.all([studioApi.takes(productionId, activePart.id), studioApi.captions(productionId, activePart.id)])
    setTakes(takeResult.takes || [])
    const nextCaptions = captionResult.transcripts || []
    setCaptions(nextCaptions)
    const preferred = nextCaptions.find((item) => item.id === preferId)
    if (preferred) setTranscript(await studioApi.transcript(preferred.id))
  }, [productionId])

  useEffect(() => {
    if (!part || !["audio", "speech"].includes(part.kind)) { setTakes([]); setCaptions([]); setTranscript(null); return }
    let active = true
    setLoading(true); setTranscript(null); setMessage(""); setCaptionConfirmation(null)
    reload(part).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Details could not be loaded.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [part?.id, reload])

  const selectTranscript = useCallback(async (item: TranscriptSummary) => {
    setMessage("Opening captions…")
    try { setTranscript(await studioApi.transcript(item.id)); setMessage("") }
    catch (error) { setMessage(error instanceof Error ? error.message : "Captions could not be opened.") }
  }, [])

  const promote = useCallback(async (take: Take) => {
    if (!part) return
    setMessage("Switching takes…")
    try { await studioApi.promoteTake(productionId, part.id, take.id); setMessage("Take promoted. Existing captions are marked for review."); await onChanged(); await reload(part) }
    catch (error) { setMessage(error instanceof Error ? error.message : "The take could not be promoted.") }
  }, [onChanged, part, productionId, reload])

  const makeCaptions = useCallback(async (confirmed = false) => {
    if (!part) return
    setCaptionBusy("transcribe"); setMessage("Listening to the current take…")
    try {
      const result = await studioApi.transcribePart(part, confirmed)
      if (result.needs_confirmation) { setCaptionConfirmation({ kind: "transcribe", estimate: result.estimate || 0 }); setMessage(""); return }
      await onChanged(); await reload(part, result.id); setMessage("Subtitles ready.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Subtitles could not be created.") }
    finally { setCaptionBusy(null) }
  }, [onChanged, part, reload])

  const translate = useCallback(async (target: string, confirmed = false) => {
    if (!part || !target) return
    const original = captions.find((item) => !item.is_translation)
    if (!original) { setMessage("Create the original subtitles first."); return }
    setCaptionBusy("translate"); setMessage(`Translating into ${target}…`)
    try {
      const result = await studioApi.translateTranscript(original.id, target, confirmed)
      if (result.needs_confirmation) { setCaptionConfirmation({ kind: "translate", estimate: result.estimate || 0, target }); setMessage(""); return }
      await onChanged(); await reload(part, result.id); setMessage(`${target} subtitles ready.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "The translation failed.") }
    finally { setCaptionBusy(null) }
  }, [captions, onChanged, part, reload])

  const confirmCaptionAction = useCallback(async () => {
    const next = captionConfirmation
    setCaptionConfirmation(null)
    if (next?.kind === "transcribe") await makeCaptions(true)
    if (next?.kind === "translate" && next.target) await translate(next.target, true)
  }, [captionConfirmation, makeCaptions, translate])

  return { takes, captions, transcript, loading, captionBusy, captionConfirmation, message, selectTranscript, promote, makeCaptions, translate, confirmCaptionAction, cancelCaptionAction: () => setCaptionConfirmation(null) }
}
