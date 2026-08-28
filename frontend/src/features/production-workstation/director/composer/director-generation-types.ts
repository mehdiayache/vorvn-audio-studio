import type { DirectorAttachmentKind, DirectorOperation } from "./director-composer-config"

export type DirectorGenerationStatus = "queued" | "generating" | "ready" | "canceled" | "failed"
export type DirectorGenerationInput = { asset_id: number; role: string; media_type: DirectorAttachmentKind; position: number }
export type DirectorGenerationRecipe = {
  prompt: string
  negative_prompt: string
  operation: DirectorOperation
  model_id: string
  inputs: DirectorGenerationInput[]
  controls: {
    ratio: string
    resolution: string
    duration: number | null
    fps: number | null
    seed: number | null
    provider_parameters: Record<string, unknown>
  }
}
export type DirectorGeneration = {
  id: string
  job_id: string
  status: DirectorGenerationStatus
  progress: number
  detail: string
  error: string | null
  recipe: DirectorGenerationRecipe
  provider: string
  model_label: string
  model_version: string
  output_media_type: "image" | "video"
  output_asset_ids: number[]
  provider_job_id: string | null
  estimated_cost: number | null
  created_at: string | null
  updated_at: string | null
}
