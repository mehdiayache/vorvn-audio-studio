import type { SoundSceneClip, SoundSceneTrack, VentureAsset } from "@/types/domain"

export type AudioFamily = "audio" | "music" | "sfx" | "ambience"
export type SoundMediaKind = "speech" | AudioFamily | "video"

export const AUDIO_FAMILY_LABELS: Record<AudioFamily, string> = {
  audio: "Audio", music: "Music", sfx: "SFX", ambience: "Ambience",
}

export const SOUND_MEDIA_LABELS: Record<SoundMediaKind, string> = {
  speech: "Speech",
  audio: "Audio clip",
  music: "Music clip",
  sfx: "SFX clip",
  ambience: "Ambience clip",
  video: "Video audio clip",
}

export function audioFamily(value?: string | null): AudioFamily {
  const category = String(value || "").trim().toLowerCase()
  if (category === "music" || category === "intro" || category === "outro") return "music"
  if (category === "sfx") return "sfx"
  if (category === "ambience") return "ambience"
  return "audio"
}

export function audioAssetFamily(asset?: Pick<VentureAsset, "category" | "kind"> | null): AudioFamily {
  return audioFamily(asset?.category)
}

export function audioAssetCategory(asset?: Pick<VentureAsset, "category"> | null): Exclude<AudioFamily, "audio"> | null {
  const category = String(asset?.category || "").trim().toLowerCase()
  return category === "music" || category === "sfx" || category === "ambience" ? category : null
}

export function audioTrackRole(track: Pick<SoundSceneTrack, "role">): AudioFamily {
  return audioFamily(track.role)
}

export function soundClipMediaKind(clip: Pick<SoundSceneClip, "asset_kind" | "source_media_type">): SoundMediaKind {
  if (clip.source_media_type === "video") return "video"
  return audioFamily(clip.asset_kind)
}

export function audioUsageTags(asset?: Pick<VentureAsset, "category" | "kind" | "tags"> | null) {
  return [...new Set((asset?.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))]
}
