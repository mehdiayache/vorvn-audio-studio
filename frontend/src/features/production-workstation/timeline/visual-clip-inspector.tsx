import { useEffect, useRef } from "react"
import { Clock3, Film, FlipHorizontal2, FlipVertical2, Image as ImageIcon, Info, Library, Maximize, Minimize2, RotateCcw, Scan, Volume2 } from "lucide-react"

import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { visualAssetDetails, visualAssetFacts, visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { AudioVolumeControl, type AudioVolumeMix } from "@/features/sound-scene/components/audio-volume-control"
import { gainToVolumePercent } from "@/features/sound-scene/sound-scene-gain"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

import "./visual-clip-inspector.css"

function milliseconds(value: number) {
  const seconds = value / 1_000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return minutes ? `${minutes}:${remainder.toFixed(1).padStart(4, "0")}` : `${remainder.toFixed(1)}s`
}

export function VisualClipInspector({ clipRef, track, clip, asset, session, saving, audioSaving = saving, hasEmbeddedAudio = false, audioMuted = false, audioGain = 1, onAudioMixChange, onAudioMixCommit }: {
  clipRef: VisualClipRef
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  session: VisualSceneSession
  saving: boolean
  audioSaving?: boolean
  hasEmbeddedAudio?: boolean
  audioMuted?: boolean
  audioGain?: number
  onAudioMixChange?: (mix: AudioVolumeMix) => void
  onAudioMixCommit?: (mix: AudioVolumeMix) => void | Promise<void>
}) {
  const details = asset ? visualAssetDetails(asset) : { technical: [], library: [] }
  const facts = asset ? visualAssetFacts(asset) : null
  const name = asset ? visualAssetName(asset) : "Missing media"
  const transformDisabled = saving || clip.locked || track.locked
  return <div className="visual-clip-inspector">
    <div className="visual-inspector-identity">
      <span className="visual-inspector-thumb">{asset?.filename ? <img src={asset.media_type === "video" ? visualAssetPosterUrl(asset) : visualAssetUrl(asset)} alt="" /> : asset?.media_type === "video" ? <Film /> : <ImageIcon />}</span>
      <span><b>{name}</b><small>{track.media_type === "video" ? "Video" : "Image"} · {facts?.dimensions || "Source unavailable"}</small></span>
    </div>

    <OperatorInspectorSection icon={Clock3} title="Timeline placement" help="Move the clip or its edges directly in Timeline. Hold Alt while dragging to bypass snapping." className="visual-inspector-placement">
      <dl>
        <div><dt>Starts</dt><dd>{milliseconds(clip.start_ms)}</dd></div>
        <div><dt>Duration</dt><dd>{milliseconds(clip.duration_ms)}</dd></div>
        {track.media_type === "video" && <div><dt>Source starts</dt><dd>{milliseconds(clip.source_offset_ms)}</dd></div>}
      </dl>
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={Scan} title="Frame" help="Fit and Fill establish a starting frame. Position, scale, rotation and flips then create custom framing." actions={<OperatorTooltip label="Reset frame" detail="Restores Fill, centered placement, 100% scale, no rotation and no flip. Opacity and audio stay unchanged."><Button variant="ghost" size="sm" disabled={transformDisabled} onClick={() => void session.resetClipTransform(clipRef)}><RotateCcw /> Reset</Button></OperatorTooltip>} className="visual-inspector-transform">
      <div className="visual-frame-actions" role="group" aria-label="Quick framing actions">
        <OperatorTooltip label="Fit entire source" detail="Recenters and removes rotation so the complete image or video is visible. Empty space may remain."><Button variant="outline" size="sm" disabled={transformDisabled} onClick={() => void session.frameClip(clipRef, "contain")}><Minimize2 /> Fit</Button></OperatorTooltip>
        <OperatorTooltip label="Fill Production frame" detail="Recenters and removes rotation, then enlarges the source until the frame is covered. Outer edges may be cropped."><Button variant="outline" size="sm" disabled={transformDisabled} onClick={() => void session.frameClip(clipRef, "cover")}><Maximize /> Fill</Button></OperatorTooltip>
      </div>
      <div className="visual-transform-position">
        <label><span>X</span><Input key={`x-${Math.round(clip.position_x)}`} type="number" defaultValue={Math.round(clip.position_x)} disabled={transformDisabled} onBlur={(event) => void session.setClipTransform(clipRef, { position_x: Number(event.target.value) || 0 })} /></label>
        <label><span>Y</span><Input key={`y-${Math.round(clip.position_y)}`} type="number" defaultValue={Math.round(clip.position_y)} disabled={transformDisabled} onBlur={(event) => void session.setClipTransform(clipRef, { position_y: Number(event.target.value) || 0 })} /></label>
      </div>
      <TransformSlider label="Scale" value={clip.scale * 100} display={`${Math.round(clip.scale * 100)}%`} minimum={5} maximum={300} disabled={transformDisabled} onPreview={(value) => session.previewClipTransform(clipRef, { scale: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { scale: value / 100 }); void session.commitGesture() }} />
      <TransformSlider label="Rotation" value={clip.rotation_degrees} display={`${Math.round(clip.rotation_degrees)}°`} minimum={-180} maximum={180} disabled={transformDisabled} onPreview={(value) => session.previewClipTransform(clipRef, { rotation_degrees: value })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { rotation_degrees: value }); void session.commitGesture() }} />
      <div className="visual-transform-flip" role="group" aria-label="Flip media">
        <Button variant={clip.flip_horizontal ? "secondary" : "outline"} size="sm" disabled={transformDisabled} aria-pressed={clip.flip_horizontal} onClick={() => void session.setClipTransform(clipRef, { flip_horizontal: !clip.flip_horizontal })}><FlipHorizontal2 /> Flip horizontal</Button>
        <Button variant={clip.flip_vertical ? "secondary" : "outline"} size="sm" disabled={transformDisabled} aria-pressed={clip.flip_vertical} onClick={() => void session.setClipTransform(clipRef, { flip_vertical: !clip.flip_vertical })}><FlipVertical2 /> Flip vertical</Button>
      </div>
      <TransformSlider label="Opacity" value={clip.opacity * 100} display={`${Math.round(clip.opacity * 100)}%`} minimum={0} maximum={100} disabled={transformDisabled} onPreview={(value) => session.previewClipTransform(clipRef, { opacity: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { opacity: value / 100 }); void session.commitGesture() }} />
    </OperatorInspectorSection>

    {track.media_type === "video" && <OperatorInspectorSection icon={Volume2} title="Video audio" meta={hasEmbeddedAudio ? `${audioMuted || audioGain <= 0 ? 0 : gainToVolumePercent(audioGain)}%` : "None"} metaTechnical help={hasEmbeddedAudio ? "This video's sound follows the visual clip in Timeline and Export." : "This video source has no embedded audio."} className="visual-inspector-audio">
      {hasEmbeddedAudio && <div className="visual-inspector-audio-controls">
        <AudioVolumeControl label="Video volume" gain={audioGain} muted={audioMuted} disabled={audioSaving || !onAudioMixChange || !onAudioMixCommit} onPreview={onAudioMixChange} onCommit={(mix) => onAudioMixCommit?.(mix)} />
      </div>}
    </OperatorInspectorSection>}

    {details.technical.length > 0 && <DetailSection title="Source" icon={Info} items={details.technical} />}
    {details.library.length > 0 && <DetailSection title="Library" icon={Library} items={details.library} />}
  </div>
}

function TransformSlider({ label, value, display, minimum, maximum, disabled, onPreview, onBegin, onCommit }: { label: string; value: number; display: string; minimum: number; maximum: number; disabled: boolean; onPreview: (value: number) => void; onBegin: () => void; onCommit: (value: number) => void }) {
  const pending = useRef(value)
  const committed = useRef(false)
  useEffect(() => { pending.current = value }, [value])
  const preview = (next: number) => { pending.current = next; onPreview(next) }
  const commit = (next: number) => { pending.current = next; committed.current = true; onCommit(next) }
  return <label className="visual-transform-slider"><span><b>{label}</b><strong>{display}</strong></span><Slider aria-label={label} value={[value]} min={minimum} max={maximum} step={1} disabled={disabled}
    onPointerDown={() => { committed.current = false; onBegin() }}
    onKeyDownCapture={() => { committed.current = false; onBegin() }}
    onKeyUp={() => { if (!committed.current) commit(pending.current) }}
    onValueChange={([next = value]) => preview(next)}
    onValueCommit={([next = value]) => commit(next)}
  /></label>
}

function DetailSection({ title, icon, items }: { title: string; icon: typeof Info; items: { label: string; value: string }[] }) {
  return <OperatorInspectorSection icon={icon} title={title} className="visual-inspector-details"><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></OperatorInspectorSection>
}
