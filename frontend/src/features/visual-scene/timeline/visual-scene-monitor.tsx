import { Image as ImageIcon } from "lucide-react"

import type { VentureAsset, VisualSceneDocument } from "@/types/domain"
import { visualAssetName, visualAssetUrl } from "@/features/production-workstation/director/director-assets"

export function VisualSceneMonitor({ document, assets, playheadMs }: { document: VisualSceneDocument; assets: VentureAsset[]; playheadMs: number }) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const active = document.tracks.flatMap((track, index) => track.visible ? track.clips.flatMap((clip) => {
    const asset = byId.get(clip.asset_id)
    return asset?.media_type === "image" && playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms
      ? [{ track, clip, asset, index }] : []
  }) : [])
  return <section className="visual-scene-monitor" aria-label="Visual monitor">
    <div className="visual-scene-monitor-frame">
      {active.length ? active.map(({ clip, asset, index }) => <img key={clip.id} src={visualAssetUrl(asset)} alt={visualAssetName(asset)} style={{ zIndex: document.tracks.length - index }} />)
        : <span><ImageIcon /><b>No visual at this time</b><small>Add an image or move the playhead over a visual clip.</small></span>}
    </div>
  </section>
}
