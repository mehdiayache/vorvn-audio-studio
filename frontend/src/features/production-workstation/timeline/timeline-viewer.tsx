import { Film, Image as ImageIcon, Ratio } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { visualAssetFacts, visualAssetName } from "@/features/production-workstation/director/director-assets"
import type { VisualClipRef, VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { VisualSceneMonitor } from "@/features/visual-scene/timeline/visual-scene-monitor"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"

import "./timeline-viewer.css"

const CANVAS_PRESETS = [
  { id: "16:9", width: 1920, height: 1080 },
  { id: "9:16", width: 1080, height: 1920 },
  { id: "1:1", width: 1080, height: 1080 },
  { id: "4:5", width: 1080, height: 1350 },
] as const

function canvasPreset(document: VisualSceneDocument) {
  return CANVAS_PRESETS.find((preset) => preset.width * document.canvas.height === preset.height * document.canvas.width)?.id || ""
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
  const track = selection ? document.tracks.find((item) => item.id === selection.trackId) : null
  const clip = selection ? track?.clips.find((item) => item.id === selection.clipId) : null
  const asset = clip ? assets.find((item) => item.id === clip.asset_id) : null
  const facts = asset ? visualAssetFacts(asset) : null
  const selectedPreset = canvasPreset(document)

  return <section className="timeline-viewer" aria-label="Production viewer">
    <div className="timeline-viewer-preview">
      <VisualSceneMonitor document={document} assets={assets} playheadMs={playheadMs} playback={playback} />
    </div>
    <div className="timeline-viewer-controls">
      <div className="timeline-viewer-output">
        <span><Ratio /> <b>Output frame</b>{saving && <small>Saving…</small>}</span>
        <ToggleGroup type="single" variant="outline" size="sm" value={selectedPreset} onValueChange={(value) => {
          const preset = CANVAS_PRESETS.find((item) => item.id === value)
          if (preset) void session.setCanvas(preset.width, preset.height)
        }} aria-label="Production output frame">
          {CANVAS_PRESETS.map((preset) => <ToggleGroupItem key={preset.id} value={preset.id} aria-label={`${preset.id} output frame`}>{preset.id}</ToggleGroupItem>)}
        </ToggleGroup>
        <small>{selectedPreset || "Custom"} · {document.canvas.width} × {document.canvas.height}</small>
      </div>
      <div className="timeline-viewer-selection">
        {asset && clip ? <>
          <span className="timeline-viewer-media-icon">{asset.media_type === "video" ? <Film /> : <ImageIcon />}</span>
          <span><b>{visualAssetName(asset)}</b><small>{asset.media_type === "video" ? "Video" : "Image"} · {facts?.dimensions}</small></span>
          <ToggleGroup type="single" variant="outline" size="sm" value={clip.fit} onValueChange={(value) => {
            if (selection && (value === "contain" || value === "cover")) void session.setClipFit(selection, value)
          }} aria-label="Selected media framing">
            <ToggleGroupItem value="contain" aria-label="Fit entire media in frame">Fit</ToggleGroupItem>
            <ToggleGroupItem value="cover" aria-label="Fill frame and crop overflow">Fill</ToggleGroupItem>
          </ToggleGroup>
        </> : <span className="timeline-viewer-guidance"><b>Frame the Production</b><small>Select an Image or Video clip to choose Fit or Fill.</small></span>}
      </div>
    </div>
  </section>
}
