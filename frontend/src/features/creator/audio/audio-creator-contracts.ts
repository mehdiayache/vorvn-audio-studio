import type { AudioFileCategory } from "@/types/domain"

export type AudioCreatorPlacementMode = "sequence" | "sound"

export type GeneratedAudioKeepInput = {
  candidateId: string
  name: string
  category: AudioFileCategory
  tags: string[]
}
