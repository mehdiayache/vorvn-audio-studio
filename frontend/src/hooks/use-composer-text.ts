import { useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { ProductionPart, TextPassResult } from "@/types/domain"
import type { SpeechEngine } from "@/lib/voice-options"

export type TextView = "raw" | "shaped" | "tagged"

function initial(part?: ProductionPart | null) {
  return {
    raw: part?.text_raw || part?.text || "",
    shaped: part?.text_shaped || "",
    tagged: part?.text_tagged || "",
  }
}

export function useComposerText(part: ProductionPart | null | undefined, productionId: number | undefined, engine: SpeechEngine | null) {
  const [states, setStates] = useState(initial(part))
  const [view, setView] = useState<TextView>((part?.text_state as TextView) || "raw")
  const [review, setReview] = useState<{ kind: "shape" | "tag"; result: TextPassResult } | null>(null)
  const [pending, setPending] = useState<{ kind: "shape" | "tag"; estimate: number } | null>(null)
  const [busy, setBusy] = useState<"shape" | "tag" | null>(null)
  const [error, setError] = useState("")
  const [density, setDensity] = useState<"none" | "light" | "normal" | "heavy">("normal")
  const text = states[view] || ""

  useEffect(() => {
    const next = initial(part)
    const nextView = (part?.text_state as TextView) || "raw"
    setStates(next)
    setView(next[nextView] ? nextView : "raw")
    setReview(null); setPending(null); setError("")
  }, [part?.id])

  function updateText(value: string) {
    setStates((current) => ({ ...current, [view]: value }))
  }

  function select(next: TextView) {
    if (!states[next] && next !== "raw") return false
    setView(next); setError("")
    return true
  }

  async function run(kind: "shape" | "tag", confirmed = false) {
    const before = text.trim()
    if (!before) { setError("Write something first."); return }
    if (!engine) { setError("Choose an exact recording route first."); return }
    setBusy(kind); setError("")
    try {
      const result = await studioApi.textPass(kind, {
        text: before,
        ...(productionId ? { production_id: productionId } : {}),
        ...(part?.id ? { part_id: part.id } : {}),
        density,
        engine,
        confirmed,
      })
      if (result.needs_confirmation) { setPending({ kind, estimate: result.estimate || 0 }); return }
      if (!result.after) throw new Error("The text pass returned no rewritten text.")
      setReview({ kind, result })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The text pass failed.")
    } finally { setBusy(null) }
  }

  async function accept() {
    if (!review?.result.after) return
    const nextView: TextView = review.kind === "shape" ? "shaped" : "tagged"
    const nextStates = {
      ...states,
      raw: states.raw || review.result.before || "",
      [nextView]: review.result.after,
    }
    setStates(nextStates); setView(nextView); setReview(null)
    if (part && productionId) await studioApi.saveTextStates(productionId, part.id, { text: review.result.after, text_raw: nextStates.raw || null, text_shaped: nextStates.shaped || null, text_tagged: nextStates.tagged || null, text_state: nextView })
  }

  return { text, states, view, review, pending, busy, error, density,
    setDensity: (value: string) => {
      if (["none", "light", "normal", "heavy"].includes(value)) {
        setDensity(value as "none" | "light" | "normal" | "heavy")
      }
    },
    updateText, select, run, accept, reject: () => setReview(null), cancelPending: () => setPending(null), confirmPending: async () => { const kind = pending?.kind; setPending(null); if (kind) await run(kind, true) } }
}
