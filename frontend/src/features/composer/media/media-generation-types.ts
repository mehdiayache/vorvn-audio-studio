import type { MediaAttachmentKind, MediaOperation } from "./media-composer-config"

export type MediaGenerationStatus = "queued" | "generating" | "ready" | "canceled" | "failed"
export type MediaGenerationInput = { file_id: number; role: string; media_type: MediaAttachmentKind; position: number }
export type MediaGenerationPreset = {
  prompt: string
  negative_prompt: string
  operation: MediaOperation
  model_id: string
  inputs: MediaGenerationInput[]
  controls: {
    ratio: string
    resolution: string
    duration: number | null
    fps: number | null
    seed: number | null
    provider_parameters: Record<string, unknown>
  }
}
export type MediaGeneration = {
  id: string
  job_id: string
  status: MediaGenerationStatus
  progress: number
  detail: string
  error: string | null
  preset: MediaGenerationPreset
  provider: string
  provider_id?: string | null
  provider_model_id?: string | null
  model_label: string
  model_version: string
  adapter_version?: string | null
  capability_manifest_version?: string | null
  capability_snapshot?: Record<string, unknown> | null
  output_media_type: "image" | "video"
  output_file_ids: number[]
  provider_job_id: string | null
  estimated_cost: number | null
  cost?: number | null
  usage?: Record<string, unknown>
  needs_confirmation?: boolean
  confirmation_message?: string | null
  can_retry_ingestion?: boolean
  local_ingestion_pending?: boolean
  requires_review?: boolean
  created_at: string | null
  updated_at: string | null
}

export function displayedGenerationCost(generation: Pick<MediaGeneration, "cost" | "estimated_cost">) {
  if (generation.cost != null) return { value: Number(generation.cost), basis: "actual" as const }
  if (generation.estimated_cost != null) return { value: Number(generation.estimated_cost), basis: "estimated" as const }
  return null
}
