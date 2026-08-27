import { ChevronDown, Film, Image as ImageIcon, MonitorPlay, Ratio } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { visualAssetName } from "@/features/production-workstation/director/director-assets"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { VisualSceneMonitor } from "@/features/visual-scene/timeline/visual-scene-monitor"
import { formatDuration } from "@/lib/format"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"

import "./timeline-viewer.css"

const CANVAS_PRESETS = [
  { id: "16:9", width: 1920, height: 1080 },
  { id: "9:16", width: 1080, height: 1920 },
  { id: "1:1", width: 1080, height: 1080 },
  { id: "4:5", width: 1080, height: 1350 },
] as const

function canvasPreset(document: VisualSceneDocument) {
  return CANVAS_PRESETS.find((preset) => preset.width * document.canvas.height === preset.height * document.canvas.width)?.id || "Custom"
}

export function TimelineViewer({ document, assets, playheadMs, playback, selection, session, saving }: {
  document: VisualSceneDocument
  assets: VentureAsset[]
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  selection: VisualClipRef | null
  session: VisualSceneSession
  saving: boolean
}) {
  const selectedTrack = selection ? document.tracks.find((track) => track.id === selection.trackId) : null
  const selectedClip = selection ? selectedTrack?.clips.find((clip) => clip.id === selection.clipId) : null
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.asset_id) : null
  const activePlacement = document.tracks.flatMap((track) => track.visible
    ? track.clips.filter((clip) => playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms)
    : []).at(-1)
  const activeAsset = activePlacement ? assets.find((asset) => asset.id === activePlacement.asset_id) : null
  const SelectedMediaIcon = selectedAsset?.media_type === "video" ? Film : ImageIcon
  const preset = canvasPreset(document)

  return <aside className="timeline-viewer" aria-label="Production viewer">
    <header className="timeline-viewer-header">
      <span><MonitorPlay /><b>Viewer</b></span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Production format ${preset}`}><Ratio />{preset}<ChevronDown /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="timeline-viewer-format-menu" align="end">
          <DropdownMenuLabel>Production format</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={preset} onValueChange={(value) => {
            const next = CANVAS_PRESETS.find((item) => item.id === value)
            if (next) void session.setCanvas(next.width, next.height)
          }}>
            {CANVAS_PRESETS.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}<small>{item.width} × {item.height}</small></DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <div className="timeline-viewer-stage">
      <VisualSceneMonitor document={document} assets={assets} playheadMs={playheadMs} playback={playback} />
    </div>
    <footer className="timeline-viewer-footer">
      <span><b>{formatDuration(playheadMs / 1_000)}</b><small>{playback === "preparing" ? "Preparing preview…" : activeAsset ? visualAssetName(activeAsset) : "No visual at playhead"}</small></span>
      {selectedAsset && <span className="timeline-viewer-selection"><SelectedMediaIcon /><small>Selected</small><b>{visualAssetName(selectedAsset)}</b></span>}
      {saving && <small className="timeline-viewer-saving">Saving…</small>}
    </footer>
  </aside>
}
