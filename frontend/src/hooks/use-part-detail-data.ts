import { useCallback, useEffect, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useJobQuery } from "@/hooks/use-job-query"
import type { CaptionMutationResult, ProductionPart, Take, Transcript, TranscriptSummary } from "@/types/domain"

export type CaptionConfirmation = { kind: "transcribe" | "translate"; estimate: number; target?: string }

export function usePartDetailData(productionId: number, part: ProductionPart | null, onChanged: () => Promise<void>) {
  const [takes, setTakes] = useState<Take[]>([])
  const [captions, setCaptions] = useState<TranscriptSummary[]>([])
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [loading, setLoading] = useState(false)
  const [captionBusy, setCaptionBusy] = useState<"transcribe" | "translate" | null>(null)
  const [captionConfirmation, setCaptionConfirmation] = useState<CaptionConfirmation | null>(null)
  const [message, setMessage] = useState("")
  const [takeConfirmation, setTakeConfirmation] = useState<Take | null>(null)
  const [captionJobId, setCaptionJobId] = useJobQuery("part-caption-job")
  const captionJob = useJobExecution<CaptionMutationResult>(captionJobId)
  const requestRef = useRef(0)
  const transcriptRequestRef = useRef(0)
  const handledJobRef = useRef<string | null>(null)
  const captionJobForPart = captionJob && part && (
    Number(captionJob.context?.part_id || captionJob.result?.part_id || 0) === part.id
    || (captionJob.type === "translate" && captions.some((item) => item.id === Number(captionJob.context?.transcript_id || 0)))
  ) ? captionJob : null

  const reload = useCallback(async (activePart: ProductionPart, preferId?: number) => {
    const request = ++requestRef.current
    const [takeResult, captionResult] = await Promise.all([studioApi.takes(productionId, activePart.id), studioApi.captions(productionId, activePart.id)])
    if (request !== requestRef.current) return
    setTakes(takeResult.takes || [])
    const nextCaptions = captionResult.transcripts || []
    setCaptions(nextCaptions)
    const preferred = nextCaptions.find((item) => item.id === preferId)
    if (preferred) {
      const nextTranscript = await studioApi.transcript(preferred.id)
      if (request === requestRef.current) setTranscript(nextTranscript)
    }
  }, [productionId])

  useEffect(() => {
    requestRef.current += 1
    transcriptRequestRef.current += 1
    if (!part || !["audio", "speech"].includes(part.kind)) { setTakes([]); setCaptions([]); setTranscript(null); return }
    let active = true
    setLoading(true); setTranscript(null); setMessage(""); setCaptionConfirmation(null); setTakeConfirmation(null)
    reload(part).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Details could not be loaded.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [part?.id, part?.kind, reload])

  const selectTranscript = useCallback(async (item: TranscriptSummary) => {
    const request = ++transcriptRequestRef.current
    setMessage("Opening captions…")
    try { const next = await studioApi.transcript(item.id); if (request === transcriptRequestRef.current) { setTranscript(next); setMessage("") } }
    catch (error) { if (request === transcriptRequestRef.current) setMessage(error instanceof Error ? error.message : "Captions could not be opened.") }
  }, [])

  const promote = useCallback(async (take: Take, confirmed = false) => {
    if (!part) return
    setMessage("Switching takes…")
    try {
      const result = await studioApi.promoteTake(productionId, part.id, take.id, { expected_revision: part.revision || 1, confirm_outdated: confirmed })
      if (result.needs_confirmation) { setTakeConfirmation(take); setMessage(""); return }
      setTakeConfirmation(null)
      setMessage(result.outdated ? "Older Take selected. It remains marked outdated because the Part has changed." : "Take selected. Existing captions are marked for review.")
      await onChanged(); await reload(part)
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "The take could not be promoted.") }
  }, [onChanged, part, productionId, reload])

  const makeCaptions = useCallback(async () => {
    if (!part) return
    setCaptionBusy("transcribe"); setMessage("Listening to the current take…")
    try {
      const job = await studioApi.enqueueTranscribePart(productionId, part)
      handledJobRef.current = null
      setCaptionJobId(job.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Subtitles could not be created.") }
  }, [part, productionId, setCaptionJobId])

  const translate = useCallback(async (target: string) => {
    if (!part || !target) return
    const original = captions.find((item) => !item.is_translation)
    if (!original) { setMessage("Create the original subtitles first."); return }
    setCaptionBusy("translate"); setMessage(`Translating into ${target}…`)
    try {
      const job = await studioApi.enqueueTranscriptTranslation(original.id, target)
      handledJobRef.current = null
      setCaptionJobId(job.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : "The translation failed.") }
    finally { setCaptionBusy(null) }
  }, [captions, part, setCaptionJobId])

  const confirmCaptionAction = useCallback(async () => {
    setCaptionConfirmation(null)
    if (!captionJobForPart) return
    const continued = await studioApi.confirmJob<CaptionMutationResult>(captionJobForPart.id)
    handledJobRef.current = null
    setCaptionJobId(continued.id)
  }, [captionJobForPart, setCaptionJobId])

  useEffect(() => {
    if (!captionJobForPart) { setCaptionBusy(null); return }
    const kind = captionJobForPart.type === "translate" ? "translate" : "transcribe"
    if (["queued", "running", "retrying"].includes(captionJobForPart.status)) {
      setCaptionBusy(kind); setMessage(kind === "translate" ? "Translating subtitles…" : "Listening to the current take…")
      return
    }
    setCaptionBusy(null)
    if (captionJobForPart.status === "blocked" && captionJobForPart.result?.needs_confirmation && !captionJobForPart.result?.requires_review) {
      setCaptionConfirmation({ kind, estimate: captionJobForPart.result.estimate || 0, target: captionJobForPart.context?.target })
      setMessage("")
      return
    }
    if (captionJobForPart.status === "blocked") { setMessage("Provider review is required before this caption operation can continue."); return }
    if (["failed", "lost", "cancelled"].includes(captionJobForPart.status)) { setMessage(captionJobForPart.error || "The caption operation did not finish."); return }
    if (!["ok", "warning"].includes(captionJobForPart.status) || handledJobRef.current === captionJobForPart.id) return
    handledJobRef.current = captionJobForPart.id
    const resultPartId = Number(captionJobForPart.result?.part_id || captionJobForPart.context?.part_id || 0)
    if (!part || (resultPartId && resultPartId !== part.id)) return
    void onChanged().then(() => reload(part, captionJobForPart.result?.id)).then(() => setMessage(kind === "translate" ? `${captionJobForPart.context?.target || "Translated"} subtitles ready.` : "Subtitles ready.")).catch((error) => setMessage(error instanceof Error ? error.message : "Caption results could not be refreshed."))
  }, [captionJobForPart, onChanged, part, reload])

  const retryCaptionJob = useCallback(async () => {
    if (captionJobForPart?.type === "translate" && captionJobForPart.context?.target) await translate(captionJobForPart.context.target)
    else await makeCaptions()
  }, [captionJobForPart?.context?.target, captionJobForPart?.type, makeCaptions, translate])

  return { takes, captions, transcript, loading, captionBusy, captionConfirmation, captionJob: captionJobForPart, takeConfirmation, message, selectTranscript, promote, confirmTake: () => takeConfirmation ? promote(takeConfirmation, true) : Promise.resolve(), cancelTakeConfirmation: () => setTakeConfirmation(null), makeCaptions, translate, confirmCaptionAction, cancelCaptionAction: () => setCaptionConfirmation(null), retryCaptionJob, dismissCaptionJob: () => setCaptionJobId(null) }
}
