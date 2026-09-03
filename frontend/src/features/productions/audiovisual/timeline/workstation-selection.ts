import type { SoundClipRef, SoundSelection } from "@/features/sound-scene/engine/sound-scene-session"
import { visualSelectionRefs, type VisualSceneSelection, type VisualClipRef } from "@/features/visual-scene/engine/visual-scene-session"
import type { SequenceProjectionSpan, SoundSceneTrack, WorkspaceFile, VisualSceneTrack } from "@/types/domain"

type AudioPlacement = {
  ref: SoundClipRef
  track: SoundSceneTrack
  clip: SoundSceneTrack["clips"][number]
  file?: WorkspaceFile
}

type VisualPlacement = {
  ref: VisualClipRef
  track: VisualSceneTrack
  clip: VisualSceneTrack["clips"][number]
  file?: WorkspaceFile
}

export type WorkstationSelection =
  | { kind: "visual-placement"; placements: VisualPlacement[]; primary: VisualPlacement }
  | { kind: "audio-placement"; placements: AudioPlacement[]; primary: AudioPlacement }
  | { kind: "script-part"; span: SequenceProjectionSpan }
  | null

export function resolveWorkstationSelection({ soundSelection, visualSelection, soundTracks, visualTracks, spans, files }: {
  soundSelection: SoundSelection
  visualSelection: VisualSceneSelection
  soundTracks: SoundSceneTrack[]
  visualTracks: VisualSceneTrack[]
  spans: SequenceProjectionSpan[]
  files: WorkspaceFile[]
}): WorkstationSelection {
  const assetsById = new Map(files.map((file) => [file.id, file]))
  const visualPlacements = visualSelectionRefs(visualSelection).flatMap((ref) => {
    const track = visualTracks.find((candidate) => candidate.id === ref.trackId)
    const clip = track?.clips.find((candidate) => candidate.id === ref.clipId)
    return track && clip ? [{ ref, track, clip, file: assetsById.get(clip.file_id) }] : []
  })
  if (visualPlacements[0]) {
    return { kind: "visual-placement", placements: visualPlacements, primary: visualPlacements[0] }
  }

  if (soundSelection?.kind === "part") {
    const span = spans.find((candidate) => candidate.part_id === soundSelection.id)
    return span ? { kind: "script-part", span } : null
  }

  const refs: SoundClipRef[] = soundSelection?.kind === "clip"
    ? [{ trackId: soundSelection.trackId, clipId: soundSelection.clipId }]
    : soundSelection?.kind === "clips" ? soundSelection.clips : []
  const audioPlacements = refs.flatMap((ref) => {
    const track = soundTracks.find((candidate) => candidate.id === ref.trackId)
    const clip = track?.clips.find((candidate) => candidate.id === ref.clipId)
    return track && clip ? [{ ref, track, clip, file: assetsById.get(clip.file_id) }] : []
  })
  return audioPlacements[0]
    ? { kind: "audio-placement", placements: audioPlacements, primary: audioPlacements[0] }
    : null
}
