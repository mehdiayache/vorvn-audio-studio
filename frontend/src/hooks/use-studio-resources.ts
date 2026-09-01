import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { AssetCollection, LoadState, VentureAsset } from "@/types/domain"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"

export type StudioAssetResources = {
  assets: VentureAsset[]
  collections: AssetCollection[]
  projectFileIds: number[]
  directorAssetIds: number[]
}

const EMPTY_ASSETS: VentureAsset[] = []
const EMPTY_COLLECTIONS: AssetCollection[] = []
const EMPTY_IDS: number[] = []

export function useStudioResources(productionId: number) {
  const [assetState, setAssetState] = useState<LoadState<StudioAssetResources>>({ status: "loading" })
  const voices = useVoiceDirectory()

  const refreshAssets = useCallback(async () => {
    setAssetState((current) => ({ status: "loading", data: current.data }))
    try {
      const result = await studioApi.assets(productionId)
      setAssetState({
        status: "ready",
        data: {
          assets: result.assets || [],
          collections: result.collections || [],
          projectFileIds: result.project_file_ids || [],
          directorAssetIds: result.director_asset_ids || [],
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The asset library is unavailable."
      setAssetState((current) => ({ status: "error", data: current.data, error: message }))
      throw error
    }
  }, [productionId])

  useEffect(() => {
    void refreshAssets().catch(() => undefined)
  }, [refreshAssets])

  return {
    assets: assetState.data?.assets || EMPTY_ASSETS,
    assetCollections: assetState.data?.collections || EMPTY_COLLECTIONS,
    projectFileIds: assetState.data?.projectFileIds || EMPTY_IDS,
    directorAssetIds: assetState.data?.directorAssetIds || EMPTY_IDS,
    assetState,
    assetError: assetState.status === "error" ? assetState.error || "The asset library is unavailable." : null,
    voiceError: voices.error || null,
    config: voices.config,
    cloned: voices.cloned,
    voiceDirectory: voices.directory,
    refreshAssets,
    refreshVoices: voices.refresh,
  }
}
