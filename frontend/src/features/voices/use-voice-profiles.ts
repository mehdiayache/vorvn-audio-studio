import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { StudioConfig, VoiceProfile } from "@/types/domain"

export function useVoiceProfiles() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [config, setConfig] = useState<StudioConfig | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    try {
      const [result, nextConfig] = await Promise.all([studioApi.voiceProfiles(), studioApi.config()])
      setProfiles(result); setConfig(nextConfig); setStatus("ready"); setError("")
    } catch (reason) {
      setStatus("error"); setError(reason instanceof Error ? reason.message : "Unable to load voices.")
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const busy = profiles.some((profile) => profile.jobs.some((job) => ["queued", "creating"].includes(job.status)))
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => void refresh(), 1800)
    return () => window.clearInterval(timer)
  }, [busy, refresh])
  return { profiles, config, status, error, refresh }
}
