import { AudioLines, AudioWaveform, Film, MicVocal, Music2, Wind } from "lucide-react"

import type { SoundMediaKind } from "./audio-taxonomy"

export * from "./audio-taxonomy"

export function SoundMediaIcon({ kind }: { kind: SoundMediaKind }) {
  if (kind === "speech") return <MicVocal />
  if (kind === "music") return <Music2 />
  if (kind === "sfx") return <AudioWaveform />
  if (kind === "ambience") return <Wind />
  if (kind === "video") return <Film />
  return <AudioLines />
}
