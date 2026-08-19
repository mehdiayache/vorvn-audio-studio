import type { SoundScene, SoundSceneClip } from "@/types/domain"

export function audibleMusicClips(soundScene: SoundScene): SoundSceneClip[] {
  return soundScene.resolved.tracks.flatMap((track) => {
    if (track.kind !== "music" || track.muted || track.volume <= 0) return []
    return track.clips.filter((clip) =>
      !clip.muted
      && !clip.missing
      && !clip.orphan
      && clip.gain > 0
      && (clip.resolved_duration_ms ?? 1) > 0,
    )
  })
}
