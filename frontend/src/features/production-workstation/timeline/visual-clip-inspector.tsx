import { useEffect, useRef, useState } from "react"
import { Clock3, Film, Image as ImageIcon, Lock, LockOpen, RotateCcw, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { visualAssetDetails, visualAssetFacts, visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import { dbToGain, formatDb, gainToDb, MAX_GAIN_DB, MIN_GAIN_DB } from "@/features/sound-scene/sound-scene-gain"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

import "./visual-clip-inspector.css"

function milliseconds(value: number) {
  const seconds = value / 1_000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return minutes ? `${minutes}:${remainder.toFixed(1).padStart(4, "0")}` : `${remainder.toFixed(1)}s`
}

export function VisualClipInspector({ clipRef, track, clip, asset, session, saving, hasEmbeddedAudio = false, audioMuted = false, audioGain = 1, onAudioMutedChange, onAudioGainChange, onAudioGainCommit }: {
  clipRef: VisualClipRef
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  session: VisualSceneSession
  saving: boolean
  hasEmbeddedAudio?: boolean
  audioMuted?: boolean
  audioGain?: number
  onAudioMutedChange?: (muted: boolean) => void | Promise<void>
  onAudioGainChange?: (gain: number) => void
  onAudioGainCommit?: () => void | Promise<void>
}) {
  const [audioGainDb, setAudioGainDb] = useState(gainToDb(audioGain))
  useEffect(() => setAudioGainDb(gainToDb(audioGain)), [audioGain])
  const details = asset ? visualAssetDetails(asset) : { technical: [], library: [] }
  const facts = asset ? visualAssetFacts(asset) : null
  const name = asset ? visualAssetName(asset) : "Missing media"
  return <div className="visual-clip-inspector">
    <div className="visual-inspector-identity">
      <span className="visual-inspector-thumb">{asset?.filename ? <img src={asset.media_type === "video" ? visualAssetPosterUrl(asset) : visualAssetUrl(asset)} alt="" /> : asset?.media_type === "video" ? <Film /> : <ImageIcon />}</span>
      <span><b>{name}</b><small>{track.media_type === "video" ? "Video" : "Image"} · {facts?.dimensions || "Source unavailable"}</small></span>
    </div>

    <section className="visual-inspector-placement">
      <header><b>Timeline placement</b></header>
      <dl>
        <div><dt>Starts</dt><dd>{milliseconds(clip.start_ms)}</dd></div>
        <div><dt>Duration</dt><dd>{milliseconds(clip.duration_ms)}</dd></div>
        {track.media_type === "video" && <div><dt>Source starts</dt><dd>{milliseconds(clip.source_offset_ms)}</dd></div>}
      </dl>
      <p><Clock3 /> Drag the clip or its edges in Timeline. Hold Alt to bypass snapping.</p>
    </section>

    <section className="visual-inspector-transform">
      <header><span><b>Frame</b><small>Position and size inside the Production format.</small></span><Button variant="ghost" size="sm" disabled={saving || clip.locked || track.locked} onClick={() => void session.resetClipTransform(clipRef)}><RotateCcw /> Reset</Button></header>
      <div className="visual-transform-position">
        <label><span>X</span><Input key={`x-${Math.round(clip.position_x)}`} type="number" defaultValue={Math.round(clip.position_x)} disabled={saving || clip.locked || track.locked} onBlur={(event) => void session.setClipTransform(clipRef, { position_x: Number(event.target.value) || 0 })} /></label>
        <label><span>Y</span><Input key={`y-${Math.round(clip.position_y)}`} type="number" defaultValue={Math.round(clip.position_y)} disabled={saving || clip.locked || track.locked} onBlur={(event) => void session.setClipTransform(clipRef, { position_y: Number(event.target.value) || 0 })} /></label>
      </div>
      <TransformSlider label="Scale" value={clip.scale * 100} display={`${Math.round(clip.scale * 100)}%`} minimum={5} maximum={300} disabled={saving || clip.locked || track.locked} onPreview={(value) => session.previewClipTransform(clipRef, { scale: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { scale: value / 100 }); void session.commitGesture() }} />
      <TransformSlider label="Opacity" value={clip.opacity * 100} display={`${Math.round(clip.opacity * 100)}%`} minimum={0} maximum={100} disabled={saving || clip.locked || track.locked} onPreview={(value) => session.previewClipTransform(clipRef, { opacity: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { opacity: value / 100 }); void session.commitGesture() }} />
      <div className="visual-transform-fit" role="group" aria-label="Media fit"><span>Fit</span><div><Button variant={clip.fit === "cover" ? "secondary" : "ghost"} size="sm" disabled={saving || clip.locked || track.locked} onClick={() => void session.setClipFit(clipRef, "cover")}>Fill</Button><Button variant={clip.fit === "contain" ? "secondary" : "ghost"} size="sm" disabled={saving || clip.locked || track.locked} onClick={() => void session.setClipFit(clipRef, "contain")}>Fit</Button></div></div>
      <p>Drag the selected media directly in Viewer to position it.</p>
    </section>

    {track.media_type === "video" && <section className="visual-inspector-audio">
      <header><span><b>Audio</b><small>{hasEmbeddedAudio ? "This video's sound follows the visual clip in Timeline and Export." : "This source has no audio."}</small></span>{hasEmbeddedAudio ? audioMuted ? <VolumeX /> : <Volume2 /> : null}</header>
      {hasEmbeddedAudio && <div className="visual-inspector-audio-controls">
        <label className="visual-inspector-audio-toggle"><span><b>Mute audio</b><small>Keeps the picture and timing unchanged.</small></span><Switch checked={audioMuted} disabled={saving || !onAudioMutedChange} onCheckedChange={(checked) => void onAudioMutedChange?.(checked)} aria-label="Mute video audio" /></label>
        <label className="visual-inspector-audio-level"><span><b>Audio level</b><small>Adjust only this video's sound.</small></span><strong>{formatDb(audioGainDb)}</strong><Slider aria-label="Video audio level" disabled={saving || !onAudioGainChange || !onAudioGainCommit} value={[audioGainDb]} min={MIN_GAIN_DB} max={MAX_GAIN_DB} step={.5} onValueChange={([value = 0]) => { setAudioGainDb(value); onAudioGainChange?.(dbToGain(value)) }} onValueCommit={([value = audioGainDb]) => { setAudioGainDb(value); onAudioGainChange?.(dbToGain(value)); void onAudioGainCommit?.() }} /></label>
      </div>}
    </section>}

    {details.technical.length > 0 && <DetailSection title="Source" items={details.technical} />}
    {details.library.length > 0 && <DetailSection title="Library" items={details.library} />}

    <div className="visual-inspector-lock">
      <Button variant="outline" onClick={() => void session.setClipLocked(clipRef, !clip.locked)}>{clip.locked ? <LockOpen /> : <Lock />}{clip.locked ? "Unlock placement" : "Lock placement"}</Button>
      <small>{clip.locked ? "Timing and trims are protected." : "Prevent accidental timing and trim changes."}</small>
    </div>
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

function DetailSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return <section className="visual-inspector-details"><header><b>{title}</b></header><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}
