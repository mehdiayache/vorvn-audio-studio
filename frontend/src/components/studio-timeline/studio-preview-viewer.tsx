import { ChevronDown, Grid2X2, Hand, Maximize2, Minus, MonitorPlay, Plus, Ratio } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

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
  const [previewZoom, setPreviewZoom] = useState(1)
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  const [transparencyGrid, setTransparencyGrid] = useState(false)
  const panGesture = useRef<{ node: HTMLDivElement; pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const preset = canvasPreset(canvas)
  const releasePan = useCallback(() => {
    const gesture = panGesture.current
    panGesture.current = null
    if (gesture) { try { gesture.node.releasePointerCapture?.(gesture.pointerId) } catch { /* capture may already have ended */ } }
    return gesture
  }, [])
  const cancelPan = useCallback(() => { const gesture = releasePan(); if (gesture) setPreviewPan({ x: gesture.originX, y: gesture.originY }) }, [releasePan])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && panGesture.current) { event.preventDefault(); event.stopPropagation(); cancelPan() } }
    const release = (event: PointerEvent) => { if (panGesture.current?.pointerId === event.pointerId) releasePan() }
    const cancel = (event: PointerEvent) => { if (panGesture.current?.pointerId === event.pointerId) cancelPan() }
    window.addEventListener("blur", cancelPan)
    window.addEventListener("keydown", escape, true)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", cancel)
    return () => { window.removeEventListener("blur", cancelPan); window.removeEventListener("keydown", escape, true); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", cancel); cancelPan() }
  }, [active, canvas.width, canvas.height, cancelPan, releasePan])

  function changePreviewZoom(next: number) {
    cancelPan()
    const zoom = Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, Number(next.toFixed(2))))
    setPreviewZoom(zoom)
    if (zoom <= 1) {
      setPreviewPan({ x: 0, y: 0 })
      setPanMode(false)
    }
  }

  function fitPreview() {
    cancelPan()
    setPreviewZoom(1)
    setPreviewPan({ x: 0, y: 0 })
    setPanMode(false)
  }

  function startPreviewPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active || !panMode || previewZoom <= 1 || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    panGesture.current = { node: event.currentTarget, pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: previewPan.x, originY: previewPan.y }
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* window cancellation remains available */ }
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
    releasePan()
  }

  const stageStyle = {
    "--preview-zoom": previewZoom,
    "--preview-pan-x": `${previewPan.x}px`,
    "--preview-pan-y": `${previewPan.y}px`,
  } as CSSProperties

  const canvasControls = <div className="preview-canvas-controls" aria-label={copy.controls}>
    <span className="preview-mode-label">{copy.mode}</span>
    <OperatorIconButton label={copy.zoomOut} disabled={!active || previewZoom <= MIN_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom - PREVIEW_ZOOM_STEP)}><Minus /></OperatorIconButton>
    <Button variant="ghost" size="sm" className="preview-zoom-value" aria-label={copy.fit} disabled={!active} onClick={fitPreview}>{previewZoom === 1 ? copy.fitValue : `${Math.round(previewZoom * 100)}%`}</Button>
    <OperatorIconButton label={copy.zoomIn} disabled={!active || previewZoom >= MAX_PREVIEW_ZOOM} onClick={() => changePreviewZoom(previewZoom + PREVIEW_ZOOM_STEP)}><Plus /></OperatorIconButton>
    <OperatorIconButton label={copy.fit} disabled={!active} onClick={fitPreview}><Maximize2 /></OperatorIconButton>
    <OperatorIconButton label={panMode ? copy.stopPan : copy.pan} detail={previewZoom <= 1 ? copy.panZoomDetail : copy.panDetail} disabled={!active || previewZoom <= 1} aria-pressed={panMode} onClick={() => { cancelPan(); setPanMode((value) => !value) }}><Hand /></OperatorIconButton>
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
      onPointerDownCapture={startPreviewPan}
      onPointerMove={movePreviewPan}
      onPointerUp={endPreviewPan}
      onPointerCancel={(event) => { if (panGesture.current?.pointerId === event.pointerId) cancelPan() }}
      onLostPointerCapture={(event) => { if (panGesture.current?.pointerId === event.pointerId) cancelPan() }}
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
