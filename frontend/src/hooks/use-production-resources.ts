import { useCallback, useEffect, useState } from "react"

import { originsApi } from "@/lib/api"
import type { LoadState, WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"

export type ProductionFileResources = {
  folders: WorkspaceFolder[]
  files: WorkspaceFile[]
  productionFileIds: number[]
  libraryFileIds: number[]
}

const EMPTY_FILES: WorkspaceFile[] = []
const EMPTY_FOLDERS: WorkspaceFolder[] = []
const EMPTY_IDS: number[] = []

export function useProductionResources(productionId: number) {
  const [fileState, setFileState] = useState<LoadState<ProductionFileResources>>({ status: "loading" })
  const voices = useVoiceDirectory()

  const refreshFiles = useCallback(async () => {
    setFileState((current) => ({ status: "loading", data: current.data }))
    try {
      const result = await originsApi.files(productionId)
      setFileState({
        status: "ready",
        data: {
          folders: result.folders || [],
          files: result.files || [],
          productionFileIds: result.production_file_ids || [],
          libraryFileIds: result.library_file_ids || [],
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file library is unavailable."
      setFileState((current) => ({ status: "error", data: current.data, error: message }))
      throw error
    }
  }, [productionId])

  useEffect(() => {
    void refreshFiles().catch(() => undefined)
  }, [refreshFiles])

  return {
    folders: fileState.data?.folders || EMPTY_FOLDERS,
    files: fileState.data?.files || EMPTY_FILES,
    productionFileIds: fileState.data?.productionFileIds || EMPTY_IDS,
    libraryFileIds: fileState.data?.libraryFileIds || EMPTY_IDS,
    fileState,
    fileError: fileState.status === "error" ? fileState.error || "The file library is unavailable." : null,
    voiceError: voices.error || null,
    config: voices.config,
    cloned: voices.cloned,
    voiceDirectory: voices.directory,
    refreshFiles,
    refreshVoices: voices.refresh,
  }
}
