import { Image as ImageIcon } from "lucide-react"
import { useEffect, useRef, type CSSProperties } from "react"

import type { VentureAsset, VisualSceneDocument } from "@/types/domain"
import { visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import type { VisualSceneClip } from "@/types/domain"

function VideoLayer({ asset, clip, playheadMs, playing, style }: {
  asset: VentureAsset
  clip: VisualSceneClip
  playheadMs: number
  playing: boolean
  style: CSSProperties
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const localSeconds = Math.max(0, (playheadMs - clip.start_ms + clip.source_offset_ms) / 1_000)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (!playing) {
      node.pause()
      if (node.readyState >= 1 && Math.abs(node.currentTime - localSeconds) > .04) {
        try { node.currentTime = localSeconds } catch { /* metadata will retry */ }
      }
      return
    }
    if (node.readyState >= 1 && (node.paused || Math.abs(node.currentTime - localSeconds) > .5)) {
      try { node.currentTime = localSeconds } catch { /* metadata will retry */ }
    }
    if (node.paused) void node.play().catch(() => undefined)
  }, [localSeconds, playing])
  return <video ref={ref} src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} style={style} muted playsInline preload="metadata" aria-label={visualAssetName(asset)} onLoadedMetadata={() => {
    const node = ref.current
    if (!node) return
    try { node.currentTime = localSeconds } catch { /* source is not seekable yet */ }
    if (playing) void node.play().catch(() => undefined)
  }} />
}

export function VisualSceneMonitor({ document, assets, playheadMs, playback }: { document: VisualSceneDocument; assets: VentureAsset[]; playheadMs: number; playback: "idle" | "preparing" | "playing" }) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const active = document.tracks.flatMap((track, index) => track.visible ? track.clips.flatMap((clip) => {
    const asset = byId.get(clip.asset_id)
    return asset && (asset.media_type === "image" || asset.media_type === "video") && playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms
      ? [{ track, clip, asset, index }] : []
  }) : [])
  return <section className="visual-scene-monitor" aria-label="Visual monitor">
    <div className="visual-scene-monitor-frame" data-orientation={document.canvas.width < document.canvas.height ? "portrait" : "landscape"} style={{ aspectRatio: `${document.canvas.width} / ${document.canvas.height}` }}>
      {active.length ? active.map(({ clip, asset, index }) => asset.media_type === "video"
        ? <VideoLayer key={clip.id} asset={asset} clip={clip} playheadMs={playheadMs} playing={playback === "playing"} style={{ zIndex: document.tracks.length - index, objectFit: clip.fit }} />
        : <img key={clip.id} src={visualAssetUrl(asset)} alt={visualAssetName(asset)} style={{ zIndex: document.tracks.length - index, objectFit: clip.fit }} />)
        : <span><ImageIcon /><b>No media at the playhead</b><small>Add media or move the playhead over an image or video.</small></span>}
    </div>
  </section>
}
