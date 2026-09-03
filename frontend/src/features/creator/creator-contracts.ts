import type { CreatorContext } from "@/lib/api"

export type CreatorCapabilityId = "image" | "video" | "speech" | "music" | "sfx"

export type CreatorResult = {
  file_ids: number[]
}

export type CreatorResultAction = {
  label: string
  detail?: string
  busyLabel?: string
  run: (result: CreatorResult) => void | Promise<void>
}

export type CreatorCapabilityPanelProps = {
  context: CreatorContext
  onResult?: (result: CreatorResult) => void | Promise<void>
  resultAction?: CreatorResultAction
}
