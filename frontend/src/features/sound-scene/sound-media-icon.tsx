import { AudioLines, AudioWaveform, Film, MicVocal, Music2 } from "lucide-react"

import type { SoundSceneClip } from "@/types/domain"

export type SoundMediaKind = "speech" | "music" | "sfx" | "video" | "audio"

export const SOUND_MEDIA_LABELS: Record<SoundMediaKind, string> = {
  speech: "Speech",
  music: "Music clip",
  sfx: "SFX clip",
  video: "Video audio clip",
  audio: "Audio clip",
}

export function soundClipMediaKind(clip: Pick<SoundSceneClip, "asset_kind" | "source_media_type">): SoundMediaKind {
  if (clip.source_media_type === "video") return "video"
  const category = String(clip.asset_kind || "audio").toLowerCase()
  if (category === "music") return "music"
  if (category === "sfx") return "sfx"
  return "audio"
}

export function SoundMediaIcon({ kind }: { kind: SoundMediaKind }) {
  if (kind === "speech") return <MicVocal />
  if (kind === "music") return <Music2 />
  if (kind === "sfx") return <AudioWaveform />
  if (kind === "video") return <Film />
  return <AudioLines />
}
