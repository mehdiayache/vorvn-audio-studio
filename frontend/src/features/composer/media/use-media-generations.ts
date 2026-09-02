import { useCallback, useEffect, useState } from "react"

import { originsApi, type ComposerContext } from "@/lib/api"
import type { MediaGeneration, MediaGenerationPreset } from "./media-generation-types"

export function useMediaGenerations(context: ComposerContext, onError: (message: string) => void) {
  const [generations, setGenerations] = useState<MediaGeneration[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const recent = await originsApi.mediaGenerations(context)
      setGenerations(recent as MediaGeneration[])
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Media history could not be loaded.")
    }
  }, [context, onError])

  useEffect(() => { void refresh() }, [refresh])
  const active = generations.some(({ status }) => status === "queued" || status === "generating")
  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [active, refresh])

  async function create(preset: MediaGenerationPreset) {
    setSubmitting(true)
    const optimisticId = `local-${crypto.randomUUID()}`
    const optimistic: MediaGeneration = {
      id: optimisticId, job_id: optimisticId, status: "queued", progress: 0,
      detail: "Starting generation", error: null, preset,
      provider: "Media", model_label: "Preparing model", model_version: "",
      output_media_type: preset.operation.includes("image") && !preset.operation.includes("video") ? "image" : "video",
      output_file_ids: [], provider_job_id: null, estimated_cost: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setGenerations((current) => [optimistic, ...current])
    try {
      const created = await originsApi.createMediaGeneration({ context, preset } as never) as MediaGeneration
      setGenerations((current) => [created, ...current.filter(({ id }) => id !== optimisticId && id !== created.id)])
      await refresh()
    } catch (reason) {
      setGenerations((current) => current.filter(({ id }) => id !== optimisticId))
      onError(reason instanceof Error ? reason.message : "The Media generation could not start.")
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel(generation: MediaGeneration) {
    try {
      await originsApi.cancelMediaGeneration(context, generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The Media generation could not be canceled.")
    }
  }

  async function confirm(generation: MediaGeneration) {
    setWorkingId(generation.id)
    try {
      await originsApi.confirmJob(generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The generation could not be confirmed.")
    } finally {
      setWorkingId(null)
    }
  }

  async function retryIngestion(generation: MediaGeneration) {
    setWorkingId(generation.id)
    try {
      await originsApi.retryMediaGenerationIngestion(context, generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The generated result could not be saved.")
    } finally {
      setWorkingId(null)
    }
  }

  return { generations, submitting, workingId, create, cancel, confirm, retryIngestion }
}
