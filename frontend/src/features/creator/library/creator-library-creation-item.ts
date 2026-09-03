import type { ReactNode } from "react"

import type { LibraryFileType } from "@/features/library/library-query"

export type CreatorLibraryCreationItem = {
  id: string
  node: ReactNode
  status?: "queued" | "generating" | "ready" | "canceled" | "failed"
  mediaType?: LibraryFileType
  createdAt?: string | null
  folderId?: number | null
  productionAssociated?: boolean
  searchText?: string
}
