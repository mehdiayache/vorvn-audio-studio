import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { DirectorGeneration, DirectorGenerationRecipe } from "./director-generation-types"

export function useDirectorGenerations(productionId: number, onError: (message: string) => void) {
  const [generations, setGenerations] = useState<DirectorGeneration[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const recent = await studioApi.directorGenerations(productionId)
      setGenerations(recent as DirectorGeneration[])
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Director history could not be loaded.")
    }
  }, [onError, productionId])

  useEffect(() => { void refresh() }, [refresh])
  const active = generations.some(({ status }) => status === "queued" || status === "generating")
  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [active, refresh])

  async function create(recipe: DirectorGenerationRecipe) {
    setSubmitting(true)
    const optimisticId = `local-${crypto.randomUUID()}`
    const optimistic: DirectorGeneration = {
      id: optimisticId, job_id: optimisticId, status: "queued", progress: 0,
      detail: "Starting generation", error: null, recipe,
      provider: "Director", model_label: "Preparing model", model_version: "",
      output_media_type: recipe.operation.includes("image") && !recipe.operation.includes("video") ? "image" : "video",
      output_asset_ids: [], provider_job_id: null, estimated_cost: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setGenerations((current) => [optimistic, ...current])
    try {
      const created = await studioApi.createDirectorGeneration(productionId, recipe as never) as DirectorGeneration
      setGenerations((current) => [created, ...current.filter(({ id }) => id !== optimisticId && id !== created.id)])
      await refresh()
    } catch (reason) {
      setGenerations((current) => current.filter(({ id }) => id !== optimisticId))
      onError(reason instanceof Error ? reason.message : "The Director generation could not start.")
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel(generation: DirectorGeneration) {
    try {
      await studioApi.cancelDirectorGeneration(productionId, generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The Director generation could not be canceled.")
    }
  }

  async function confirm(generation: DirectorGeneration) {
    setWorkingId(generation.id)
    try {
      await studioApi.confirmJob(generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The generation could not be confirmed.")
    } finally {
      setWorkingId(null)
    }
  }

  async function retryIngestion(generation: DirectorGeneration) {
    setWorkingId(generation.id)
    try {
      await studioApi.retryDirectorGenerationIngestion(productionId, generation.job_id)
      await refresh()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The generated result could not be saved.")
    } finally {
      setWorkingId(null)
    }
  }

  return { generations, submitting, workingId, create, cancel, confirm, retryIngestion }
}
