import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { AssetCollection, VentureAsset } from "@/types/domain"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"

export function useStudioResources(productionId: number) {
  const [assets, setAssets] = useState<VentureAsset[]>([])
  const [assetCollections, setAssetCollections] = useState<AssetCollection[]>([])
  const voices = useVoiceDirectory()

  const refreshAssets = useCallback(async () => {
    const result = await studioApi.assets(productionId)
    setAssets(result.assets || [])
    setAssetCollections(result.collections || [])
  }, [productionId])

  useEffect(() => {
    void refreshAssets().catch(() => setAssets([]))
  }, [refreshAssets])

  return { assets, assetCollections, config: voices.config, cloned: voices.cloned, voiceDirectory: voices.directory, refreshAssets, refreshVoices: voices.refresh }
}
