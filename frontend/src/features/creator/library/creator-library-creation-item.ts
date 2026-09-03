import type { ReactNode } from "react"

export type CreatorLibraryCreationItem = {
  id: string
  node: ReactNode
  status?: "queued" | "generating" | "ready" | "canceled" | "failed"
  mediaType?: "image" | "video" | "audio" | "speech" | "music" | "sfx"
  createdAt?: string | null
}
