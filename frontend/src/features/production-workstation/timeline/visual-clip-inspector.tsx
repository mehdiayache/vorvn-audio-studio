import { useEffect, useState } from "react"
import { Clock3, Film, Image as ImageIcon, Lock, LockOpen, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
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

function DetailSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return <section className="visual-inspector-details"><header><b>{title}</b></header><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}
