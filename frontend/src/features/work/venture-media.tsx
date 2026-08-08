import { Library, Music2, Play, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AudioPlayerDock } from "@/components/audio-player-dock"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePlayer } from "@/hooks/use-player"
import { formatDuration } from "@/lib/format"
import { audioUrl, studioApi } from "@/lib/api"
import type { VentureAsset, VentureOverview } from "@/types/domain"

type MediaKind = VentureOverview["asset_summary"]["by_kind"][string]

function MediaCollection({ item, refresh, onOpen }: { item: MediaKind; refresh: () => void; onOpen: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function upload(file?: File) {
    if (!file || uploading) return
    setUploading(true)
    try {
      await studioApi.uploadAsset(item.collection_id, file)
      toast.success(`${file.name} added to ${item.name}.`)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to upload this file.")
    } finally {
      setUploading(false)
      setDragging(false)
    }
  }

  return <article className={`media-collection ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}>
    <span className="media-collection-icon"><Music2 /></span>
    <div><h3>{item.name}</h3><p>{item.count} file{item.count === 1 ? "" : "s"}{item.duration_ms ? ` · ${formatDuration(item.duration_ms / 1000)}` : ""}</p></div>
    <div className="media-collection-actions"><Button variant="ghost" size="sm" onClick={onOpen}><Library /> View</Button><label className="media-upload-button" aria-label={`Upload to ${item.name}`}><input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = "" }} /><Upload /> {uploading ? "Uploading…" : "Add file"}</label></div>
    <small>Drop audio here</small>
  </article>
}

export function VentureMedia({ ventureId, summary, refresh }: { ventureId: number; summary: VentureOverview["asset_summary"]; refresh: () => void }) {
  const collections = Object.values(summary.by_kind)
  const [open, setOpen] = useState<MediaKind | null>(null)
  const [assets, setAssets] = useState<VentureAsset[]>([])
  const player = usePlayer()
  useEffect(() => { if (open) void studioApi.ventureAssets(ventureId).then((result) => setAssets(result.assets.filter((asset) => asset.folder === open.name || asset.collection === open.name))).catch((reason) => toast.error(reason instanceof Error ? reason.message : "Media could not be loaded.")) }, [open, ventureId])
  return <><section className="work-section venture-media"><header className="work-section-head"><div><h2>Media</h2><p>Reusable Venture-owned Intros, Outros, Music and Stingers.</p></div></header><div className="media-collection-grid">{collections.map((item) => <MediaCollection item={item} refresh={refresh} onOpen={() => setOpen(item)} key={item.collection_id} />)}</div></section><Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpen(null) }}><DialogContent><DialogHeader><DialogTitle>{open?.name || "Media"}</DialogTitle><DialogDescription>Reusable files available to Productions in this Venture.</DialogDescription></DialogHeader><div className="venture-asset-list">{assets.length ? assets.map((asset) => <article key={asset.id}><Music2 /><div><b>{asset.title || asset.name || asset.filename}</b><small>{formatDuration(Number(asset.duration_ms || 0) / 1000)}</small></div>{asset.filename && <Button variant="ghost" size="icon" aria-label={`Play ${asset.title || asset.filename}`} onClick={() => void player.toggleSource({ key: `asset:${asset.id}`, url: audioUrl(asset.filename), title: String(asset.title || asset.filename), subtitle: open?.name, kind: open?.name === "Music" ? "music" : "asset" })}><Play /></Button>}</article>) : <p className="work-empty compact">No files in this library yet.</p>}</div></DialogContent></Dialog><AudioPlayerDock label="Venture media" source={player.source} state={player.state} currentTime={player.currentTime} duration={player.duration} onToggle={() => void player.toggle()} onSeek={player.seek} onClose={player.close} /></>
}
