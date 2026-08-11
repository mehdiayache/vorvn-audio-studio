import { useEffect, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import type { ProductionPart, TextPassResult } from "@/types/domain"
import type { SpeechEngine } from "@/lib/voice-options"
import type { ComposerText, TextReviewReference } from "@/lib/composer-contract"

export type TextView = "raw" | "shaped" | "tagged"
export type TagDensity = "none" | "light" | "normal" | "heavy"

type PreparationOptions = {
  reviewReference?: TextReviewReference | null
  onReviewReferenceChange?: (reference: TextReviewReference | null, text?: ComposerText) => Promise<void> | void
}

function initial(part?: ProductionPart | null) {
  return {
    raw: part?.text_raw || part?.text || "",
    shaped: part?.text_shaped || "",
    tagged: part?.text_tagged || "",
  }
}

export function useComposerText(
  part: ProductionPart | null | undefined,
  productionId: number | undefined,
  engine: SpeechEngine | null,
  options: PreparationOptions = {},
) {
  const [states, setStates] = useState(initial(part))
  const [view, setView] = useState<TextView>((part?.text_state as TextView) || "raw")
  const [review, setReview] = useState<{ kind: "shape" | "tag"; result: TextPassResult } | null>(null)
  const [pending, setPending] = useState<{ kind: "shape" | "tag"; estimate: number } | null>(null)
  const [busy, setBusy] = useState<"shape" | "tag" | null>(null)
  const [error, setError] = useState("")
  const [density, setDensityState] = useState<TagDensity>("normal")
  const [activeReference, setActiveReference] = useState<TextReviewReference | null>(options.reviewReference || null)
  const referenceChangeRef = useRef(options.onReviewReferenceChange)
  referenceChangeRef.current = options.onReviewReferenceChange
  const text = states[view] || ""

  useEffect(() => {
    const next = initial(part)
    const nextView = (part?.text_state as TextView) || "raw"
    setStates(next)
    setView(next[nextView] ? nextView : "raw")
    setReview(null); setPending(null); setError("")
    setActiveReference(options.reviewReference || null)
  // The parent restores the persisted reference separately from Part identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id])

  useEffect(() => {
    setActiveReference(options.reviewReference || null)
  }, [options.reviewReference])

  useEffect(() => {
    if (!activeReference) return
    let active = true
    setBusy(activeReference.kind)
    setError("")
    void studioApi.textPassResult(activeReference.jobId).then((result) => {
      if (!active) return
      if (result.needs_confirmation) {
        setPending({ kind: activeReference.kind, estimate: result.estimate || 0 })
        return
      }
      if (!result.after) throw new Error("The text pass returned no rewritten text.")
      setReview({ kind: activeReference.kind, result })
    }).catch(async (reason) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : "The text pass failed.")
      try {
        await referenceChangeRef.current?.(null)
        if (active) setActiveReference(null)
      } catch {
        // Keep the pointer recoverable when clearing it could not be persisted.
      }
    }).finally(() => { if (active) setBusy(null) })
    return () => { active = false }
  }, [activeReference])

  function currentText(): ComposerText {
    return { raw: states.raw, shaped: states.shaped, tagged: states.tagged, active: view }
  }

  function updateText(value: string) {
    setStates((current) => ({ ...current, [view]: value }))
  }

  function select(next: TextView) {
    if (!states[next] && next !== "raw") return false
    setView(next); setError("")
    return true
  }

  function restore(next: ComposerText, nextDensity: TagDensity = "normal") {
    setStates({ raw: next.raw, shaped: next.shaped, tagged: next.tagged })
    setView(next[next.active] || next.active === "raw" ? next.active : "raw")
    setDensityState(nextDensity)
    setReview(null); setPending(null); setError("")
  }

  async function run(kind: "shape" | "tag", confirmed = false) {
    const before = text.trim()
    if (!before) { setError("Write something first."); return }
    if (!engine) { setError("Choose an exact recording route first."); return }
    setBusy(kind); setError("")
    try {
      const job = await studioApi.enqueueTextPass(kind, {
        text: before,
        ...(productionId ? { production_id: productionId } : {}),
        ...(part?.id ? { part_id: part.id } : {}),
        density,
        engine,
        confirmed,
      })
      const reference = { jobId: job.id, kind } satisfies TextReviewReference
      setReview(null)
      setActiveReference(reference)
      await referenceChangeRef.current?.(reference)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The text pass failed.")
      setBusy(null)
    }
  }

  async function accept() {
    if (!review?.result.after) return
    const nextView: TextView = review.kind === "shape" ? "shaped" : "tagged"
    const nextStates = {
      ...states,
      raw: states.raw || review.result.before || "",
      [nextView]: review.result.after,
    }
    const nextText = { ...nextStates, active: nextView } satisfies ComposerText
    if (part && productionId) await studioApi.saveTextStates(productionId, part.id, { text: review.result.after, text_raw: nextStates.raw || null, text_shaped: nextStates.shaped || null, text_tagged: nextStates.tagged || null, text_state: nextView })
    await referenceChangeRef.current?.(null, nextText)
    setStates(nextStates); setView(nextView); setReview(null); setActiveReference(null)
  }

  async function reject() {
    await referenceChangeRef.current?.(null, currentText())
    setReview(null); setActiveReference(null)
  }

  async function cancelPending() {
    await referenceChangeRef.current?.(null, currentText())
    setPending(null); setActiveReference(null)
  }

  return { text, states, view, review, pending, busy, error, density,
    setDensity: (value: string) => {
      if (["none", "light", "normal", "heavy"].includes(value)) setDensityState(value as TagDensity)
    },
    updateText, select, restore, run, accept, reject, cancelPending,
    confirmPending: async () => {
      const kind = pending?.kind
      setPending(null)
      if (kind) await run(kind, true)
    },
  }
}
