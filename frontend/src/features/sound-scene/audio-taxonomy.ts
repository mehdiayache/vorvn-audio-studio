import type {WorkspaceFile} from "@/types/domain"

import {AUDIO_FAMILY_LABELS, SOUND_MEDIA_LABELS, audioFamily, audioTrackRole, soundClipMediaKind} from "../../components/studio-timeline/studio-audio-presentation"
import type {AudioFamily, SoundMediaKind} from "../../components/studio-timeline/studio-timeline-model"
export {AUDIO_FAMILY_LABELS, SOUND_MEDIA_LABELS, audioFamily, audioTrackRole, soundClipMediaKind}
export type {AudioFamily, SoundMediaKind}

export function audioFamilyLabel(value?: string | null, fallback = "Workspace audio") {
  const raw = String(value || "").trim()
  if (!raw) return fallback
  const family = audioFamily(raw)
  return family === "audio" && raw.toLowerCase() !== "audio"
    ? raw
    : AUDIO_FAMILY_LABELS[family]
}

export function audioFileFamily(file?: Pick<WorkspaceFile, "category" | "kind"> | null): AudioFamily {
  return audioFamily(file?.category)
}

export function audioFileCategory(file?: Pick<WorkspaceFile, "category"> | null): Exclude<AudioFamily, "audio"> | null {
  const category = String(file?.category || "").trim().toLowerCase()
  return category === "music" || category === "sfx" || category === "ambience" ? category : null
}

export function audioUsageTags(file?: Pick<WorkspaceFile, "category" | "kind" | "tags"> | null) {
  return [...new Set((file?.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))]
}
