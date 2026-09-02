import { useCallback, useEffect, useMemo, useState } from "react"

import { originsApi } from "@/lib/api"
import { listenForVoiceDirectoryChanges } from "@/lib/voice-directory-events"
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
    const results = await Promise.allSettled([
      originsApi.config(), originsApi.voiceRegistry(), originsApi.voiceMeta(), originsApi.voiceUsage(), originsApi.voiceProfiles(),
    ] as const)
    const [nextConfig, voiceRegistry, metadata, voiceUsage, voiceProfiles] = results
    if (nextConfig.status === "fulfilled") setConfig(nextConfig.value)
    if (voiceRegistry.status === "fulfilled") {
      setRegistry(voiceRegistry.value)
      const registryValue = voiceRegistry.value
      // Keep the mapped bindings from the same registry snapshot.
      setCloned((registryValue.bindings || []).filter((binding) => binding.source === "custom").map((binding): ClonedVoice => ({
        voice_id: binding.provider_voice_id, voice: binding.provider_voice_id,
        engine: binding.engine, target_model: binding.model_id, name: binding.name,
        languages: binding.languages.join(","), status: binding.status,
      })))
    }
    if (metadata.status === "fulfilled") setMeta(metadata.value.voices || {})
    if (voiceUsage.status === "fulfilled") setUsage(voiceUsage.value.usage || {})
    if (voiceProfiles.status === "fulfilled") setIdentities(voiceProfiles.value)
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
    if (failures.length) setError(failures[0]?.reason instanceof Error ? failures[0].reason.message : "Some voice resources could not be refreshed.")
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const refreshWhenCurrent = () => { if (document.visibilityState === "visible") void refresh() }
    const stopListening = listenForVoiceDirectoryChanges(() => { void refresh() })
    window.addEventListener("focus", refreshWhenCurrent)
    document.addEventListener("visibilitychange", refreshWhenCurrent)
    return () => {
      window.removeEventListener("focus", refreshWhenCurrent)
      document.removeEventListener("visibilitychange", refreshWhenCurrent)
      stopListening()
    }
  }, [refresh])

  const catalog = useMemo<VoiceCatalogItem[]>(() => (registry?.bindings || []).filter((binding) => binding.source === "system").map((binding) => ({ id: binding.provider_voice_id, tier: binding.tier, name: binding.name, trait: binding.description, language: binding.languages.join(", ") })), [registry])
  const directory = useMemo<VoiceDirectory>(() => ({ config, cloned, meta, catalog, registry, usage, identities }), [catalog, cloned, config, identities, meta, registry, usage])
  return { config, cloned, directory, loading, error, refresh }
}
