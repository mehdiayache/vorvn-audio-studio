import { useEffect, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import type { ProductionPart, TextPassResult } from "@/types/domain"
import { composerTextFromPart, type ComposerText, type SpokenProfile, type TextReviewReference } from "@/lib/composer-contract"

export type TextView = "raw" | "shaped" | "tagged"
export type TagDensity = "none" | "light" | "normal" | "heavy"

type PreparationOptions = {
  reviewReference?: TextReviewReference | null
  onReviewReferenceChange?: (reference: TextReviewReference | null, text?: ComposerText) => Promise<void> | void
}

function initial(part?: ProductionPart | null) {
  const { active: _active, ...states } = composerTextFromPart(part)
  return states
}

function recordedSpokenProfile(part?: ProductionPart | null): SpokenProfile {
  const profile = part?.speech_job?.request?.spoken_profile
  return profile === "spoken_2" ? "spoken_2" : "spoken_1"
}

export function useComposerText(
  part: ProductionPart | null | undefined,
  productionId: number | undefined,
  capabilityId: string | null,
  options: PreparationOptions = {},
) {
  const [states, setStates] = useState(initial(part))
  const [view, setView] = useState<TextView>(composerTextFromPart(part).active)
  const [review, setReview] = useState<{ kind: "shape" | "tag"; result: TextPassResult } | null>(null)
  const [pending, setPending] = useState<{ kind: "shape" | "tag"; estimate: number } | null>(null)
  const [busy, setBusy] = useState<"shape" | "tag" | null>(null)
  const [error, setError] = useState("")
  const [density, setDensityState] = useState<TagDensity>("normal")
  const [spokenProfile, setSpokenProfile] = useState<SpokenProfile>(recordedSpokenProfile(part))
  const [activeReference, setActiveReference] = useState<TextReviewReference | null>(options.reviewReference || null)
  const referenceChangeRef = useRef(options.onReviewReferenceChange)
  referenceChangeRef.current = options.onReviewReferenceChange
  const restoredJobId = options.reviewReference?.jobId
  const restoredKind = options.reviewReference?.kind
  const text = states[view] || ""

  useEffect(() => {
    const restored = composerTextFromPart(part)
    const { active: nextView, ...next } = restored
    setStates(next)
    setView(nextView)
    setReview(null); setPending(null); setError("")
    setSpokenProfile(recordedSpokenProfile(part))
    setActiveReference(options.reviewReference || null)
  // The parent restores the persisted reference separately from Part identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id])

  useEffect(() => {
    setActiveReference(
      restoredJobId && restoredKind
        ? { jobId: restoredJobId, kind: restoredKind }
        : null,
    )
  }, [restoredJobId, restoredKind])

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

  function restore(next: ComposerText, nextDensity: TagDensity = "normal", nextSpokenProfile: SpokenProfile = "spoken_1") {
    setStates({ raw: next.raw, shaped: next.shaped, tagged: next.tagged })
    setView(next[next.active] || next.active === "raw" ? next.active : "raw")
    setDensityState(nextDensity)
    setSpokenProfile(nextSpokenProfile)
    setReview(null); setPending(null); setError("")
  }

  async function run(kind: "shape" | "tag", confirmed = false, requestedProfile: SpokenProfile = spokenProfile) {
    const before = text.trim()
    if (!before) { setError("Write something first."); return }
    if (!capabilityId) { setError("Choose an exact recording route first."); return }
    setBusy(kind); setError("")
    try {
      const job = await studioApi.enqueueTextPass(kind, {
        text: before,
        ...(productionId ? { production_id: productionId } : {}),
        ...(part?.id ? { part_id: part.id } : {}),
        density,
        ...(kind === "shape" ? { spoken_profile: requestedProfile } : {}),
        capability_id: capabilityId,
        confirmed,
      })
      const reference = { jobId: job.id, kind, ...(kind === "shape" ? { spokenProfile: requestedProfile } : {}) } satisfies TextReviewReference
      setReview(null)
      setActiveReference(reference)
      await referenceChangeRef.current?.(reference)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The text pass failed.")
      setBusy(null)
    }
  }

  async function accept() {
    const after = review?.result.after
    if (!review || !after) return
    const accepted = review
    const nextView: TextView = accepted.kind === "shape" ? "shaped" : "tagged"
    const nextStates = {
      ...states,
      raw: states.raw || accepted.result.before || "",
      [nextView]: after,
    }
    const nextText = { ...nextStates, active: nextView } satisfies ComposerText
    setBusy(accepted.kind); setError("")
    try {
      if (part && productionId) await studioApi.saveTextStates(productionId, part.id, { text: after, text_raw: nextStates.raw || null, text_shaped: nextStates.shaped || null, text_tagged: nextStates.tagged || null, text_state: nextView })
      await referenceChangeRef.current?.(null, nextText)
      setStates(nextStates); setView(nextView); setReview(null); setActiveReference(null)
      if (accepted.kind === "shape") setSpokenProfile(accepted.result.spoken_profile === "spoken_2" ? "spoken_2" : "spoken_1")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The prepared text could not be accepted.")
    } finally {
      setBusy(null)
    }
  }

  async function reject() {
    await referenceChangeRef.current?.(null, currentText())
    setReview(null); setActiveReference(null)
  }

  async function cancelPending() {
    await referenceChangeRef.current?.(null, currentText())
    setPending(null); setActiveReference(null)
  }

  async function confirmPending() {
    const reference = activeReference
    if (!reference || !pending) return
    setBusy(reference.kind); setError(""); setPending(null)
    try {
      const job = await studioApi.confirmJob<TextPassResult>(reference.jobId)
      const continued = { jobId: job.id, kind: reference.kind } satisfies TextReviewReference
      setActiveReference(continued)
      await referenceChangeRef.current?.(continued)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cost confirmation failed.")
      setPending({ kind: reference.kind, estimate: pending.estimate })
    } finally {
      setBusy(null)
    }
  }

  return { text, states, view, review, pending, busy, error, density, spokenProfile,
    setDensity: (value: string) => {
      if (["none", "light", "normal", "heavy"].includes(value)) setDensityState(value as TagDensity)
    },
    updateText, select, restore, run, accept, reject, cancelPending,
    confirmPending,
  }
}
