import { Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { AudioAssetCard } from "@/components/audio-asset-card"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { audioAssetFamily, AUDIO_FAMILY_LABELS, type AudioFamily } from "@/features/sound-scene/audio-presentation"
import { audioUrl, studioApi } from "@/lib/api"
import type { VentureAsset, VentureOverview } from "@/types/domain"

const FILTERS: ("all" | AudioFamily)[] = ["all", "audio", "music", "sfx", "ambience"]

export function VentureMedia({ ventureId, summary, refresh }: { ventureId: number; summary: VentureOverview["asset_summary"]; refresh: () => void }) {
  const [assets, setAssets] = useState<VentureAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState<"all" | AudioFamily>("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const player = useGlobalPlayer()
  const collection = summary.by_kind.assets

  const load = async () => {
    setLoading(true)
    try { setAssets((await studioApi.ventureAssets(ventureId)).assets.filter((asset) => asset.media_type === "audio" || !asset.media_type)) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The Asset Library could not be loaded.") }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [ventureId])
  const shown = useMemo(() => assets.filter((asset) => filter === "all" || audioAssetFamily(asset) === filter), [assets, filter])

  const upload = async (file?: File) => {
    if (!file || uploading || !collection) return
    setUploading(true)
    try {
      await studioApi.uploadAsset(collection.collection_id, file, { name: file.name.replace(/\.[^.]+$/, ""), category: "audio", scope: "venture", tags: [] })
      toast.success(`${file.name} added to the Asset Library.`)
      await load(); refresh()
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to upload this file.") }
    finally { setUploading(false) }
  }

  return <section className="work-section venture-media">
    <header className="work-section-head"><div><h2>Asset Library</h2><p>Reusable audio for every Production in this Venture.</p></div><label className="media-upload-button"><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" disabled={uploading || !collection} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = "" }} /><Upload />{uploading ? "Uploading…" : "Add audio"}</label></header>
    <div className="venture-media-filters" aria-label="Filter Asset Library">{FILTERS.map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>{value === "all" ? "All audio" : AUDIO_FAMILY_LABELS[value]}</Button>)}</div>
    {loading ? <div className="venture-asset-card-grid" aria-label="Loading Asset Library"><Skeleton /><Skeleton /><Skeleton /></div> : shown.length ? <div className="venture-asset-card-grid">{shown.map((asset) => {
      const key = `asset:${asset.id}`
      return <AudioAssetCard key={asset.id} asset={asset} selected={selectedId === asset.id} playing={player.state === "playing" && player.source?.key === key} onSelect={() => setSelectedId(asset.id)} onPlay={asset.filename ? () => void player.toggleSource({ key, url: audioUrl(asset.filename!), title: String(asset.title || asset.name || asset.filename), subtitle: AUDIO_FAMILY_LABELS[audioAssetFamily(asset)], kind: "asset" }) : undefined} />
    })}</div> : <p className="work-empty compact">No {filter === "all" ? "audio" : AUDIO_FAMILY_LABELS[filter].toLowerCase()} in this library yet.</p>}
  </section>
}
