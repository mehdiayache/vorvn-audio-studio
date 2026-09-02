import type { SoundSceneClip, SoundSceneTrack, WorkspaceFile } from "@/types/domain"

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

export function audioFileFamily(file?: Pick<WorkspaceFile, "category" | "kind"> | null): AudioFamily {
  return audioFamily(file?.category)
}

export function audioFileCategory(file?: Pick<WorkspaceFile, "category"> | null): Exclude<AudioFamily, "audio"> | null {
  const category = String(file?.category || "").trim().toLowerCase()
  return category === "music" || category === "sfx" || category === "ambience" ? category : null
}

export function audioTrackRole(track: Pick<SoundSceneTrack, "role">): AudioFamily {
  return audioFamily(track.role)
}

export function soundClipMediaKind(clip: Pick<SoundSceneClip, "file_kind" | "source_media_type">): SoundMediaKind {
  if (clip.source_media_type === "video") return "video"
  return audioFamily(clip.file_kind)
}

export function audioUsageTags(file?: Pick<WorkspaceFile, "category" | "kind" | "tags"> | null) {
  return [...new Set((file?.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))]
}
