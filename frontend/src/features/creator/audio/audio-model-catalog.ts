import { originsApi } from "@/lib/api"

export type AudioCreatorStatus = Awaited<ReturnType<typeof originsApi.audioGenerationStatus>>

let audioStatus: AudioCreatorStatus | null = null
let audioStatusRequest: Promise<AudioCreatorStatus> | null = null

export function cachedAudioCreatorStatus() {
  return audioStatus
}

export function loadAudioCreatorStatus({ refresh = false }: { refresh?: boolean } = {}) {
  if (!refresh && audioStatus) return Promise.resolve(audioStatus)
  if (!refresh && audioStatusRequest) return audioStatusRequest
  audioStatusRequest = originsApi.audioGenerationStatus().then((status) => {
    audioStatus = status
    return status
  }).finally(() => {
    audioStatusRequest = null
  })
  return audioStatusRequest
}

export function preloadAudioModelCatalog(capabilities: readonly string[]) {
  if (capabilities.some((capability) => capability === "music" || capability === "sfx") && typeof originsApi.audioGenerationStatus === "function") {
    void loadAudioCreatorStatus().catch(() => undefined)
  }
}
