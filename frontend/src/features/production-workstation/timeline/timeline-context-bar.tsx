import { CircleAlert, X } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import type { SoundSceneSession, SoundClipRef } from "@/features/sound-scene/engine/sound-scene-session"
import { SoundSceneContextToolbar, type SoundContext } from "@/features/sound-scene/timeline/sound-scene-context-toolbar"
import { videoHasEmbeddedAudio } from "@/features/sound-scene/engine/video-audio-sync"
import type { VisualSceneSession, VisualClipRef } from "@/features/visual-scene/engine/visual-scene-session"
import { VisualContextToolbar } from "@/features/visual-scene/timeline/visual-timeline-parts"
import type { SequenceProjectionSpan, SoundSceneTrack, VentureAsset, VisualSceneTrack } from "@/types/domain"

type SelectedVideoAudio = { trackId: string; clip: SoundSceneTrack["clips"][number] }

export function TimelineContextBar({ audioSession, visualSession, selectedAudioRefs, selectedPart, context, selectedVisualRefs, selectedVisualTrack, selectedVisualAsset, selectedVideoAudio, playhead, saving, visualSaving, canSplitAudio, canSplitVisual, canCrossfade, error, visualError, onFollowPlayhead, onRemoveAudio, onRemoveVisual }: {
  audioSession: SoundSceneSession
  visualSession?: VisualSceneSession
  selectedAudioRefs: SoundClipRef[]
  selectedPart: SequenceProjectionSpan | null
  context: SoundContext | null
  selectedVisualRefs: VisualClipRef[]
  selectedVisualTrack: VisualSceneTrack | null
  selectedVisualAsset?: VentureAsset
  selectedVideoAudio?: SelectedVideoAudio
  playhead: number
  saving: boolean
  visualSaving: boolean
  canSplitAudio: boolean
  canSplitVisual: boolean
  canCrossfade: boolean
  error: string | null
  visualError: string | null
  onFollowPlayhead: () => void
  onRemoveAudio: () => void
  onRemoveVisual: () => void
}) {
  const selectedVisualRef = selectedVisualRefs[0] || null
  const selectedVisualClip = selectedVisualRef ? selectedVisualTrack?.clips.find((clip) => clip.id === selectedVisualRef.clipId) || null : null
  const feedback = error || visualError

  return <footer className="sound-scene-context-bar" aria-label="Selection actions">
    {selectedVisualRef && selectedVisualTrack && selectedVisualClip && visualSession ? <VisualContextToolbar
      count={selectedVisualRefs.length}
      track={selectedVisualTrack}
      clip={selectedVisualClip}
      asset={selectedVisualAsset}
      saving={visualSaving || saving}
      canSplit={selectedVisualRefs.length === 1 && canSplitVisual}
      hasAudio={selectedVisualRefs.length === 1 && videoHasEmbeddedAudio(selectedVisualAsset)}
      audioMuted={selectedVideoAudio ? selectedVideoAudio.clip.muted || selectedVideoAudio.clip.gain <= 0 : undefined}
      selectionLocked={selectedVisualRefs.every((ref) => visualSession.currentClip(ref)?.locked)}
      onAudioMute={selectedVisualRefs.length === 1 && selectedVideoAudio ? () => {
        const muted = selectedVideoAudio.clip.muted || selectedVideoAudio.clip.gain <= 0
        void audioSession.commitClipChanges(selectedVideoAudio.trackId, selectedVideoAudio.clip.id, { muted: !muted, ...(!muted || selectedVideoAudio.clip.gain > 0 ? {} : { gain: 1 }) })
      } : undefined}
      onSplit={() => void visualSession.splitVideo(selectedVisualRef, playhead * 1000, selectedVisualAsset)}
      onLock={() => void visualSession.setClipsLocked(selectedVisualRefs, !selectedVisualRefs.every((ref) => visualSession.currentClip(ref)?.locked))}
      onDuplicate={() => void visualSession.duplicateClips(selectedVisualRefs)}
      onDelete={onRemoveVisual}
    /> : context ? <SoundSceneContextToolbar
      context={context}
      saving={saving}
      onMute={(muted) => { if (selectedPart) void audioSession.updateSequenceOverride(selectedPart.part_public_id, { muted, ...(!muted && selectedPart.mix.gain <= 0 ? { gain: 1 } : {}) }); else void audioSession.commitSelectedClipMute(muted, selectedAudioRefs) }}
      onVolumePreview={({ gain, muted }, relative) => { if (relative) return; if (selectedPart) audioSession.previewSequenceOverride(selectedPart.part_public_id, { gain, muted }); else if (selectedAudioRefs[0]) audioSession.updateClip(selectedAudioRefs[0].trackId, selectedAudioRefs[0].clipId, { gain, muted }) }}
      onVolume={({ gain, muted }, relative) => { if (relative) { if (muted) void audioSession.commitSelectedClipMute(true, selectedAudioRefs); else void audioSession.commitSelectedClipVolumeMultiplier(gain, selectedAudioRefs) } else if (selectedPart) void audioSession.updateSequenceOverride(selectedPart.part_public_id, { gain, muted }); else if (selectedAudioRefs[0]) void audioSession.commitClipChanges(selectedAudioRefs[0].trackId, selectedAudioRefs[0].clipId, { gain, muted }) }}
      onEffectsPreview={(effects) => { if (selectedPart) audioSession.previewSequenceOverride(selectedPart.part_public_id, { effects }); else if (selectedAudioRefs[0]) audioSession.updateClip(selectedAudioRefs[0].trackId, selectedAudioRefs[0].clipId, { effects }) }}
      onEffects={(effects) => { if (selectedPart) void audioSession.updateSequenceOverride(selectedPart.part_public_id, { effects }); else if (selectedAudioRefs[0]) void audioSession.commitClipChanges(selectedAudioRefs[0].trackId, selectedAudioRefs[0].clipId, { effects }) }}
      onLock={() => void audioSession.commitSelectedClipChanges({ locked: context.lockState !== "locked" }, selectedAudioRefs)}
      canSplit={canSplitAudio}
      onSplit={() => void audioSession.splitClipsAtPlayhead(selectedAudioRefs)}
      onDuplicate={() => void audioSession.duplicateClips(selectedAudioRefs)}
      onCrossfade={canCrossfade ? () => void audioSession.crossfadeSelected(selectedAudioRefs) : undefined}
      onPlaySelection={() => { onFollowPlayhead(); void audioSession.playSelection(false, selectedAudioRefs) }}
      onLoopSelection={() => { onFollowPlayhead(); void audioSession.playSelection(true, selectedAudioRefs) }}
      onDelete={onRemoveAudio}
    /> : <span className="sound-context-empty">Select a clip or Script Part to edit it</span>}
    {feedback && <div className="sound-context-feedback" role="alert" aria-live="assertive">
      <CircleAlert aria-hidden="true" />
      <OperatorTooltip label={feedback} side="top"><span>{feedback}</span></OperatorTooltip>
      <OperatorIconButton label="Dismiss Timeline message" onClick={() => { audioSession.clearError(); visualSession?.clearError() }}><X /></OperatorIconButton>
    </div>}
  </footer>
}
