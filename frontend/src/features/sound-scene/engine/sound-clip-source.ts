import { audioUrl } from "@/lib/api"
import type { SoundSceneClip } from "@/types/domain"

export function soundClipSourceUrl(clip: Pick<SoundSceneClip, "filename" | "source_media_type">) {
  if (!clip.filename) return ""
  return clip.source_media_type === "video"
    ? `/api/v1/media/audio-proxy/${encodeURIComponent(clip.filename)}`
    : audioUrl(clip.filename)
}
