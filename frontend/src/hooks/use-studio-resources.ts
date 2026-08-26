import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { AssetCollection, VentureAsset } from "@/types/domain"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"

export function useStudioResources(productionId: number) {
  const [assets, setAssets] = useState<VentureAsset[]>([])
  const [assetCollections, setAssetCollections] = useState<AssetCollection[]>([])
  const [directorAssetIds, setDirectorAssetIds] = useState<number[]>([])
  const [assetError, setAssetError] = useState<string | null>(null)
  const voices = useVoiceDirectory()

  const refreshAssets = useCallback(async () => {
    try {
      const result = await studioApi.assets(productionId)
      setAssets(result.assets || [])
      setAssetCollections(result.collections || [])
      setDirectorAssetIds(result.director_asset_ids || [])
      setAssetError(null)
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "The asset library is unavailable.")
      throw error
    }
  }, [productionId])

  useEffect(() => {
    void refreshAssets().catch(() => undefined)
  }, [refreshAssets])

  return { assets, assetCollections, directorAssetIds, assetError, voiceError: voices.error || null, config: voices.config, cloned: voices.cloned, voiceDirectory: voices.directory, refreshAssets, refreshVoices: voices.refresh }
}
