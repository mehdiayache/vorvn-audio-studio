import type { SoundSceneClip, SoundSceneTrack, VentureAsset } from "@/types/domain"

export type AudioFamily = "audio" | "music" | "sfx" | "ambience"
export type SoundMediaKind = "speech" | AudioFamily | "video"

export const AUDIO_FAMILY_LABELS: Record<AudioFamily, string> = {
  audio: "Other audio", music: "Music", sfx: "SFX", ambience: "Ambience",
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
  return audioFamily(asset?.category || asset?.kind)
}

export function audioTrackRole(track: Pick<SoundSceneTrack, "role">): AudioFamily {
  return audioFamily(track.role)
}

export function soundClipMediaKind(clip: Pick<SoundSceneClip, "asset_kind" | "source_media_type">): SoundMediaKind {
  if (clip.source_media_type === "video") return "video"
  return audioFamily(clip.asset_kind)
}

export function audioUsageTags(asset?: Pick<VentureAsset, "category" | "kind" | "tags"> | null) {
  const category = String(asset?.category || asset?.kind || "").toLowerCase()
  return [...new Set([
    ...(category === "intro" || category === "outro" ? [category] : []),
    ...(asset?.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
  ])]
}

const MUSIC_TERMS = new Set(["music", "musical", "song", "beat", "melody", "instrumental", "orchestra", "piano", "guitar", "synth", "soundtrack", "jingle", "theme", "sting", "stinger", "bed", "underscore"])
const AMBIENCE_TERMS = new Set(["ambience", "ambient", "atmosphere", "atmospheric", "soundscape", "roomtone", "room-tone", "nature", "rain", "ocean", "waves", "wind", "forest", "cityscape", "field-recording"])
const SFX_TERMS = new Set(["sfx", "effect", "effects", "foley", "impact", "transition", "hit", "whoosh", "door", "footstep", "footsteps", "explosion", "horn", "beep", "click", "bell", "mechanical"])

export function suggestedAudioFamily(input: { name?: string | null; tags?: string[] | null }): AudioFamily {
  const terms = `${input.name || ""} ${(input.tags || []).join(" ")}`.toLocaleLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean)
  if (terms.some((term) => MUSIC_TERMS.has(term))) return "music"
  if (terms.some((term) => AMBIENCE_TERMS.has(term))) return "ambience"
  if (terms.some((term) => SFX_TERMS.has(term))) return "sfx"
  return "audio"
}
