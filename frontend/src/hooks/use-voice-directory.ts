import { useCallback, useEffect, useMemo, useState } from "react"

import { studioApi } from "@/lib/api"
import type { ClonedVoice, StudioConfig, VoiceCatalogItem, VoiceDirectory, VoiceMeta, VoiceRegistry } from "@/types/domain"

export function useVoiceDirectory() {
  const [config, setConfig] = useState<StudioConfig | null>(null)
  const [cloned, setCloned] = useState<ClonedVoice[]>([])
  const [meta, setMeta] = useState<Record<string, VoiceMeta>>({})
  const [usage, setUsage] = useState<VoiceDirectory["usage"]>({})
  const [registry, setRegistry] = useState<VoiceRegistry | null>(null)
  const [identities, setIdentities] = useState<VoiceDirectory["identities"]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setError("")
    try {
      const [nextConfig, voiceRegistry, metadata, voiceUsage, voiceProfiles] = await Promise.all([
        studioApi.config(), studioApi.voiceRegistry(), studioApi.voiceMeta(), studioApi.voiceUsage(), studioApi.voiceProfiles(),
      ])
      setConfig(nextConfig)
      setRegistry(voiceRegistry)
      setCloned((voiceRegistry.bindings || []).filter((binding) => binding.source === "custom").map((binding): ClonedVoice => ({
        voice_id: binding.provider_voice_id, voice: binding.provider_voice_id,
        engine: binding.engine, target_model: binding.model_id, name: binding.name,
        languages: binding.languages.join(","), status: binding.status,
      })))
      setMeta(metadata.voices || {})
      setUsage(voiceUsage.usage || {})
      setIdentities(voiceProfiles)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Voice resources could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const refreshWhenCurrent = () => { if (document.visibilityState === "visible") void refresh() }
    const refreshFromAnotherTab = (event: StorageEvent) => { if (event.key === "vorvn:voices-revision") void refresh() }
    window.addEventListener("focus", refreshWhenCurrent)
    document.addEventListener("visibilitychange", refreshWhenCurrent)
    window.addEventListener("storage", refreshFromAnotherTab)
    return () => {
      window.removeEventListener("focus", refreshWhenCurrent)
      document.removeEventListener("visibilitychange", refreshWhenCurrent)
      window.removeEventListener("storage", refreshFromAnotherTab)
    }
  }, [refresh])

  const catalog = useMemo<VoiceCatalogItem[]>(() => (registry?.bindings || []).filter((binding) => binding.source === "system").map((binding) => ({ id: binding.provider_voice_id, tier: binding.tier, name: binding.name, trait: binding.description, language: binding.languages.join(", ") })), [registry])
  const directory = useMemo<VoiceDirectory>(() => ({ config, cloned, meta, catalog, registry, usage, identities }), [catalog, cloned, config, identities, meta, registry, usage])
  return { config, cloned, directory, loading, error, refresh }
}
