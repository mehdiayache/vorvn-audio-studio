import { useCallback, useEffect, useState } from "react"

import { studioApi } from "@/lib/api"
import type { StudioConfig, VoiceProfile } from "@/types/domain"

export function useVoiceProfiles() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([])
  const [config, setConfig] = useState<StudioConfig | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    const [voiceResult, configResult] = await Promise.allSettled([studioApi.voiceProfiles(), studioApi.config()])
    if (voiceResult.status === "fulfilled") setProfiles(voiceResult.value)
    if (configResult.status === "fulfilled") setConfig(configResult.value)
    const failure = voiceResult.status === "rejected" ? voiceResult.reason : configResult.status === "rejected" ? configResult.reason : null
    setStatus(failure ? "error" : "ready")
    setError(failure instanceof Error ? failure.message : failure ? "Unable to refresh every voice resource." : "")
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
