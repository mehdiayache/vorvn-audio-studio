import { Clock3, Film, Image as ImageIcon, Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { visualAssetDetails, visualAssetFacts, visualAssetName, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import type { VentureAsset, VisualSceneClip, VisualSceneTrack } from "@/types/domain"

import "./visual-clip-inspector.css"

function milliseconds(value: number) {
  const seconds = value / 1_000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return minutes ? `${minutes}:${remainder.toFixed(1).padStart(4, "0")}` : `${remainder.toFixed(1)}s`
}

export function VisualClipInspector({ clipRef, track, clip, asset, session, saving }: {
  clipRef: VisualClipRef
  track: VisualSceneTrack
  clip: VisualSceneClip
  asset?: VentureAsset
  session: VisualSceneSession
  saving: boolean
}) {
  const details = asset ? visualAssetDetails(asset) : { technical: [], library: [] }
  const facts = asset ? visualAssetFacts(asset) : null
  const name = asset ? visualAssetName(asset) : "Missing media"
  return <div className="visual-clip-inspector">
    <div className="visual-inspector-identity">
      <span className="visual-inspector-thumb">{asset?.filename ? <img src={asset.media_type === "video" ? visualAssetPosterUrl(asset) : visualAssetUrl(asset)} alt="" /> : asset?.media_type === "video" ? <Film /> : <ImageIcon />}</span>
      <span><b>{name}</b><small>{track.media_type === "video" ? "Video" : "Image"} · {facts?.dimensions || "Source unavailable"}</small></span>
    </div>

    <section className="visual-inspector-framing">
      <header><span><b>Framing</b><small>How this media sits inside the Production frame.</small></span>{saving && <small>Saving…</small>}</header>
      <ToggleGroup type="single" variant="outline" value={clip.fit} onValueChange={(value) => {
        if (value === "contain" || value === "cover") void session.setClipFit(clipRef, value)
      }} aria-label="Clip framing">
        <ToggleGroupItem value="contain">Fit entire media</ToggleGroupItem>
        <ToggleGroupItem value="cover">Fill and crop</ToggleGroupItem>
      </ToggleGroup>
    </section>

    <section className="visual-inspector-placement">
      <header><b>Timeline placement</b></header>
      <dl>
        <div><dt>Starts</dt><dd>{milliseconds(clip.start_ms)}</dd></div>
        <div><dt>Duration</dt><dd>{milliseconds(clip.duration_ms)}</dd></div>
        {track.media_type === "video" && <div><dt>Source starts</dt><dd>{milliseconds(clip.source_offset_ms)}</dd></div>}
      </dl>
      <p><Clock3 /> Drag the clip or its edges in Timeline. Hold Alt to bypass snapping.</p>
    </section>

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
