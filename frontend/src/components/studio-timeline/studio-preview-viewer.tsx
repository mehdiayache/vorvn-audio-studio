import { ChevronDown, Grid2X2, Hand, Maximize2, Minus, MonitorPlay, Plus, Ratio } from "lucide-react"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { FeedbackMessage } from "@/components/ui/feedback-message"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { WorkstationPaneHeader } from "./workstation-pane-header"
import "./studio-preview-viewer.css"
import {useStudioPreviewViewport} from "./use-studio-preview-viewport"

export const STUDIO_CANVAS_PRESETS = [
  { id: "16:9", width: 1920, height: 1080 },
  { id: "9:16", width: 1080, height: 1920 },
  { id: "1:1", width: 1080, height: 1080 },
  { id: "4:5", width: 1080, height: 1350 },
] as const

const MIN_PREVIEW_ZOOM = .5
const MAX_PREVIEW_ZOOM = 3
const PREVIEW_ZOOM_STEP = .25

function canvasPreset(canvas: { width: number; height: number }) {
  return STUDIO_CANVAS_PRESETS.find((preset) => preset.width * canvas.height === preset.height * canvas.width)?.id || "Custom"
}

export type StudioPreviewLabels = { preview: string; mode: string; controls: string; zoomOut: string; zoomIn: string; fit: string; fitValue: string; pan: string; stopPan: string; panZoomDetail: string; panDetail: string; gridShow: string; gridHide: string; format: string; custom: string; saving: string; error: string }
const DEFAULT_LABELS: StudioPreviewLabels = { preview: "Preview", mode: "timeline", controls: "Timeline Preview canvas controls", zoomOut: "Zoom Timeline Preview out", zoomIn: "Zoom Timeline Preview in", fit: "Fit Timeline Preview canvas", fitValue: "Fit", pan: "Pan Timeline Preview canvas", stopPan: "Stop panning Timeline Preview canvas", panZoomDetail: "Zoom in before panning the Preview canvas.", panDetail: "Drag the Preview canvas without changing media placement.", gridShow: "Show transparency grid", gridHide: "Hide transparency grid", format: "Production format", custom: "Custom", saving: "Saving…", error: "The canvas format could not be saved." }

/** Actual Studio viewer: canvas/view controls are local; persisted format is host-owned. */
export function StudioPreviewViewer({ canvas, children, transport, saving = false, editable = false, active = true, onCanvasChange, labels, className, ariaLabel = "Timeline Preview", transportLabel = "Timeline Preview transport" }: {
  canvas: { width: number; height: number }
  children: ReactNode
  transport?: ReactNode
  saving?: boolean
  editable?: boolean
  active?: boolean
  onCanvasChange?: (width: number, height: number) => Promise<unknown> | void
  labels?: Partial<StudioPreviewLabels>
  className?: string
  ariaLabel?: string
  transportLabel?: string
}) {
  const copy = { ...DEFAULT_LABELS, ...labels }
  const [error, setError] = useState(false)
  const viewport=useStudioPreviewViewport(active)
  const previewZoom=viewport.view.zoom,previewPan=viewport.view.pan,panMode=viewport.panMode
  const [transparencyGrid,setTransparencyGrid]=useState(false)
  const preset=canvasPreset(canvas)
  useEffect(()=>{viewport.cancel()},[canvas.width,canvas.height,viewport.cancel])
  const changePreviewZoom=viewport.zoom,fitPreview=viewport.fit

  const stageStyle = {
    "--preview-zoom": previewZoom,
    "--preview-pan-x": `${previewPan.x}px`,
    "--preview-pan-y": `${previewPan.y}px`,
  } as CSSProperties

  const canvasControls = <div className="preview-canvas-controls" aria-label={copy.controls}>
    <span className="preview-mode-label">{copy.mode}</span>
    <OperatorIconButton className="preview-zoom-out" label={copy.zoomOut} disabled={!active || previewZoom <= MIN_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom - PREVIEW_ZOOM_STEP)}><Minus /></OperatorIconButton>
    <Button variant="ghost" size="sm" className="preview-zoom-value" aria-label={copy.fit} disabled={!active} onClick={fitPreview}>{previewZoom === 1 ? copy.fitValue : `${Math.round(previewZoom * 100)}%`}</Button>
    <OperatorIconButton className="preview-zoom-in" label={copy.zoomIn} disabled={!active || previewZoom >= MAX_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom + PREVIEW_ZOOM_STEP)}><Plus /></OperatorIconButton>
    <OperatorIconButton label={copy.fit} disabled={!active} onClick={fitPreview}><Maximize2 /></OperatorIconButton>
    <OperatorIconButton className="preview-pan-control" label={panMode ? copy.stopPan : copy.pan} detail={previewZoom <= 1 ? copy.panZoomDetail : copy.panDetail} disabled={!active || previewZoom <= 1} aria-pressed={panMode} onClick={viewport.togglePan}><Hand /></OperatorIconButton>
    <OperatorIconButton label={transparencyGrid ? copy.gridHide : copy.gridShow} disabled={!active} aria-pressed={transparencyGrid} onClick={() => setTransparencyGrid((visible) => !visible)}><Grid2X2 /></OperatorIconButton>
    <span className="preview-canvas-controls-separator" />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={!active || !editable || saving || !onCanvasChange} aria-label={`${copy.format} ${preset === "Custom" ? copy.custom : preset}`}><Ratio />{preset === "Custom" ? copy.custom : preset}<ChevronDown /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="timeline-viewer-format-menu" align="end">
        <DropdownMenuLabel>{copy.format}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preset} onValueChange={(value) => {
          const next = STUDIO_CANVAS_PRESETS.find((item) => item.id === value)
          if (!next || !active || !editable || saving || !onCanvasChange) return
          setError(false)
          try { Promise.resolve(onCanvasChange(next.width, next.height)).catch(() => setError(true)) }
          catch { setError(true) }
        }}>
          {STUDIO_CANVAS_PRESETS.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.id}<small>{item.width} × {item.height}</small></DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>

  return <aside className={cn("timeline-viewer", "studio-preview-viewer", className)} aria-label={ariaLabel}>
    <WorkstationPaneHeader icon={<MonitorPlay />} title={copy.preview} actions={canvasControls} />
    <div
      className={cn("timeline-viewer-stage", previewZoom > 1 && "can-pan", panMode && "is-pan-mode", transparencyGrid && "show-transparency-grid")}
      style={stageStyle}
      ref={viewport.stageRef}
      {...viewport.stageProps}
    >
      {children}
    </div>
    {(transport || saving || error) && <footer className="timeline-preview-footer" aria-label={transportLabel}>
      {transport}
      <span className="timeline-preview-save-state">{saving ? copy.saving : ""}</span>
      {error && <FeedbackMessage tone="error" announce>{copy.error}</FeedbackMessage>}
    </footer>}
  </aside>
}
