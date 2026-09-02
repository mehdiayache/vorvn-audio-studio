import type { SoundScene, VisualSceneDocument } from "@/types/domain"

export function visualSceneEndMs(document: VisualSceneDocument) {
  return Math.max(0, ...document.tracks.flatMap((track) => track.clips.map((clip) => clip.start_ms + clip.duration_ms)))
}

export function projectTimelineDurationMs(soundScene: SoundScene, visualDocument: VisualSceneDocument) {
  return Math.max(
    Number(soundScene.resolved.duration_ms || 0),
    Number(soundScene.resolved.sequence_projection.duration_ms || 0),
    visualSceneEndMs(visualDocument),
  )
}
