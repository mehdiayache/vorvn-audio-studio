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

const MIN_PROGRAM_ZOOM = .5
const MAX_PROGRAM_ZOOM = 3
const PROGRAM_ZOOM_STEP = .25

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
  const [programZoom, setProgramZoom] = useState(1)
  const [programPan, setProgramPan] = useState({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  const [transparencyGrid, setTransparencyGrid] = useState(false)
  const panGesture = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const activePlacement = document.tracks.flatMap((track) => track.visible
    ? track.clips.filter((clip) => playheadMs >= clip.start_ms && playheadMs < clip.start_ms + clip.duration_ms)
    : []).at(0)
  const activeAsset = activePlacement ? assets.find((asset) => asset.id === activePlacement.asset_id) : null
  const preset = canvasPreset(document)
  const activeName = activeAsset ? visualAssetName(activeAsset) : "No visual at playhead"

  function changeProgramZoom(next: number) {
    const zoom = Math.max(MIN_PROGRAM_ZOOM, Math.min(MAX_PROGRAM_ZOOM, Number(next.toFixed(2))))
    setProgramZoom(zoom)
    if (zoom <= 1) {
      setProgramPan({ x: 0, y: 0 })
      setPanMode(false)
    }
  }

  function fitProgram() {
    setProgramZoom(1)
    setProgramPan({ x: 0, y: 0 })
    setPanMode(false)
  }

  function startProgramPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panMode || programZoom <= 1 || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    panGesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: programPan.x, originY: programPan.y }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveProgramPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = panGesture.current
    if (!active || active.pointerId !== event.pointerId) return
    event.preventDefault()
    setProgramPan({ x: active.originX + event.clientX - active.x, y: active.originY + event.clientY - active.y })
  }

  function endProgramPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = panGesture.current
    if (!active || active.pointerId !== event.pointerId) return
    panGesture.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const stageStyle = {
    "--program-zoom": programZoom,
    "--program-pan-x": `${programPan.x}px`,
    "--program-pan-y": `${programPan.y}px`,
  } as CSSProperties

  const canvasControls = <div className="program-canvas-controls" aria-label="Program canvas controls">
    <OperatorIconButton label="Zoom Program out" disabled={programZoom <= MIN_PROGRAM_ZOOM} onClick={() => changeProgramZoom(programZoom - PROGRAM_ZOOM_STEP)}><Minus /></OperatorIconButton>
    <Button variant="ghost" size="sm" className="program-zoom-value" aria-label="Fit Program canvas" onClick={fitProgram}>{programZoom === 1 ? "Fit" : `${Math.round(programZoom * 100)}%`}</Button>
    <OperatorIconButton label="Zoom Program in" disabled={programZoom >= MAX_PROGRAM_ZOOM} onClick={() => changeProgramZoom(programZoom + PROGRAM_ZOOM_STEP)}><Plus /></OperatorIconButton>
    <OperatorIconButton label="Fit Program canvas" onClick={fitProgram}><Maximize2 /></OperatorIconButton>
    <OperatorIconButton label={panMode ? "Stop panning Program canvas" : "Pan Program canvas"} detail={programZoom <= 1 ? "Zoom in before panning the Program canvas." : "Drag the Program canvas without changing media placement."} disabled={programZoom <= 1} aria-pressed={panMode} onClick={() => setPanMode((active) => !active)}><Hand /></OperatorIconButton>
    <OperatorIconButton label={transparencyGrid ? "Hide transparency grid" : "Show transparency grid"} aria-pressed={transparencyGrid} onClick={() => setTransparencyGrid((visible) => !visible)}><Grid2X2 /></OperatorIconButton>
    <span className="program-canvas-controls-separator" />
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

  return <aside className="timeline-viewer" aria-label="Program Monitor">
    <WorkstationPaneHeader icon={<MonitorPlay />} title="Program" actions={canvasControls} />
    <div
      className={cn("timeline-viewer-stage", programZoom > 1 && "can-pan", panMode && "is-pan-mode", transparencyGrid && "show-transparency-grid")}
      style={stageStyle}
      onPointerDownCapture={startProgramPan}
      onPointerMove={moveProgramPan}
      onPointerUp={endProgramPan}
      onPointerCancel={endProgramPan}
    >
      <VisualSceneMonitor document={document} assets={assets} playheadMs={playheadMs} playback={playback} selection={selection} session={session} />
    </div>
    <footer className="program-status-strip" aria-label="Program status">
      <b>{formatDuration(playheadMs / 1_000)}</b>
      <small title={activeName}>{activeName}</small>
      <span>{saving ? "Saving…" : playback === "preparing" ? "Preparing…" : ""}</span>
    </footer>
  </aside>
}
