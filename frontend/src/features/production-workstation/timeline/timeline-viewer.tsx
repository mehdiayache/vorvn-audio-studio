import { ChevronDown, Grid2X2, Hand, Maximize2, Minus, MonitorPlay, Plus, Ratio } from "lucide-react"
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { OperatorIconButton } from "@/components/operator-action"
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
import { cn } from "@/lib/utils"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"

import { WorkstationPaneHeader } from "./workstation-pane-header"
import "./timeline-viewer.css"

const CANVAS_PRESETS = [
  { id: "16:9", width: 1920, height: 1080 },
  { id: "9:16", width: 1080, height: 1920 },
  { id: "1:1", width: 1080, height: 1080 },
  { id: "4:5", width: 1080, height: 1350 },
] as const

const MIN_PREVIEW_ZOOM = .5
const MAX_PREVIEW_ZOOM = 3
const PREVIEW_ZOOM_STEP = .25

function canvasPreset(document: VisualSceneDocument) {
  return CANVAS_PRESETS.find((preset) => preset.width * document.canvas.height === preset.height * document.canvas.width)?.id || "Custom"
}

export function TimelinePreview({ document, assets, playheadMs, playback, selection, session, saving }: {
  document: VisualSceneDocument
  assets: VentureAsset[]
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  selection: VisualClipRef | null
  session: VisualSceneSession
  saving: boolean
}) {
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  const [transparencyGrid, setTransparencyGrid] = useState(false)
  const panGesture = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const activePlacement = document.tracks.flatMap((track) => track.visible
    ? track.clips.filter((clip) => playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms)
    : []).at(0)
  const activeAsset = activePlacement ? assets.find((asset) => asset.id === activePlacement.asset_id) : null
  const preset = canvasPreset(document)
  const activeName = activeAsset ? visualAssetName(activeAsset) : "No visual at playhead"

  function changePreviewZoom(next: number) {
    const zoom = Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, Number(next.toFixed(2))))
    setPreviewZoom(zoom)
    if (zoom <= 1) {
      setPreviewPan({ x: 0, y: 0 })
      setPanMode(false)
    }
  }

  function fitPreview() {
    setPreviewZoom(1)
    setPreviewPan({ x: 0, y: 0 })
    setPanMode(false)
  }

  function startPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panMode || previewZoom <= 1 || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    panGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: previewPan.x, originY: previewPan.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function movePreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = panGesture.current
    if (!active || active.pointerId !== event.pointerId) return
    event.preventDefault()
    setPreviewPan({ x: active.originX + event.clientX - active.x, y: active.originY + event.clientY - active.y })
  }

  function endPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = panGesture.current
    if (!active || active.pointerId !== event.pointerId) return
    panGesture.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const stageStyle = {
    "--preview-zoom": previewZoom,
    "--preview-pan-x": `${previewPan.x}px`,
    "--preview-pan-y": `${previewPan.y}px`,
  } as CSSProperties

  const canvasControls = <div className="preview-canvas-controls" aria-label="Timeline Preview canvas controls">
    <span className="preview-mode-label">timeline</span>
    <OperatorIconButton label="Zoom Timeline Preview out" disabled={previewZoom <= MIN_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom - PREVIEW_ZOOM_STEP)}><Minus /></OperatorIconButton>
    <Button variant="ghost" size="sm" className="preview-zoom-value" aria-label="Fit Timeline Preview canvas" onClick={fitPreview}>{previewZoom === 1 ? "Fit" : `${Math.round(previewZoom * 100)}%`}</Button>
    <OperatorIconButton label="Zoom Timeline Preview in" disabled={previewZoom >= MAX_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom + PREVIEW_ZOOM_STEP)}><Plus /></OperatorIconButton>
    <OperatorIconButton label="Fit Timeline Preview canvas" onClick={fitPreview}><Maximize2 /></OperatorIconButton>
    <OperatorIconButton label={panMode ? "Stop panning Timeline Preview canvas" : "Pan Timeline Preview canvas"} detail={previewZoom <= 1 ? "Zoom in before panning the Preview canvas." : "Drag the Preview canvas without changing media placement."} disabled={previewZoom <= 1} aria-pressed={panMode} onClick={() => setPanMode((active) => !active)}><Hand /></OperatorIconButton>
    <OperatorIconButton label={transparencyGrid ? "Hide transparency grid" : "Show transparency grid"} aria-pressed={transparencyGrid} onClick={() => setTransparencyGrid((visible) => !visible)}><Grid2X2 /></OperatorIconButton>
    <span className="preview-canvas-controls-separator" />
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
  </div>

  return <aside className="timeline-viewer" aria-label="Timeline Preview">
    <WorkstationPaneHeader icon={<MonitorPlay />} title="Preview" actions={canvasControls} />
    <div
      className={cn("timeline-viewer-stage", previewZoom > 1 && "can-pan", panMode && "is-pan-mode", transparencyGrid && "show-transparency-grid")}
      style={stageStyle}
      onPointerDownCapture={startPreviewPan}
      onPointerMove={movePreviewPan}
      onPointerUp={endPreviewPan}
      onPointerCancel={endPreviewPan}
    >
      <VisualSceneMonitor document={document} assets={assets} playheadMs={playheadMs} playback={playback} selection={selection} session={session} />
    </div>
    <footer className="timeline-preview-status" aria-label="Timeline Preview status">
      <b>{formatDuration(playheadMs / 1_000)}</b>
      <small title={activeName}>{activeName}</small>
      <span>{saving ? "Saving…" : playback === "preparing" ? "Preparing…" : ""}</span>
    </footer>
  </aside>
}
