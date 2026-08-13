import { GripVertical, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react"

import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"
import { Button } from "@/components/ui/button"

export type ProductionWorkbenchMode =
  | "composer"
  | "part"
  | "takes"
  | "captions"
  | "cast"
  | "music"
  | "asset"
  | "health"
  | "mix-export"
  | "technical"

const STORAGE_KEY = "audio-studio:production-workbench-width"
const MIN_WIDTH = 420
const DEFAULT_WIDTH = 560

export function clampProductionWorkbenchWidth(value: number, viewportWidth = window.innerWidth) {
  const maximum = Math.max(MIN_WIDTH, Math.floor(viewportWidth * 0.6))
  return Math.min(maximum, Math.max(MIN_WIDTH, Math.round(value)))
}

function savedWidth() {
  const stored = Number.parseFloat(window.localStorage.getItem(STORAGE_KEY) || "")
  return clampProductionWorkbenchWidth(Number.isFinite(stored) ? stored : DEFAULT_WIDTH)
}

export function ProductionWorkbench({ mode, title, description, onClose, children, canvas }: {
  mode: ProductionWorkbenchMode | null
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  canvas: ReactNode
}) {
  const [width, setWidth] = useState(savedWidth)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const liveWidth = useRef(width)
  const open = Boolean(mode)
  const style = { "--production-workbench-width": `${width}px` } as CSSProperties

  useEffect(() => {
    const resize = () => setWidth((current) => clampProductionWorkbenchWidth(current))
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [])

  function commit(next: number) {
    const value = clampProductionWorkbenchWidth(next)
    liveWidth.current = value
    setWidth(value)
    window.localStorage.setItem(STORAGE_KEY, String(value))
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    drag.current = { startX: event.clientX, startWidth: width }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const next = clampProductionWorkbenchWidth(drag.current.startWidth + drag.current.startX - event.clientX)
    liveWidth.current = next
    setWidth(next)
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    commit(liveWidth.current)
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const changes: Record<string, number> = {
      ArrowLeft: width + 24,
      ArrowRight: width - 24,
      Home: MIN_WIDTH,
      End: window.innerWidth * 0.6,
    }
    const next = changes[event.key]
    if (next === undefined) return
    event.preventDefault()
    commit(next)
  }

  return <section className={`production-workstation${open ? " has-workbench" : ""}`} style={style}>
    <div className="production-canvas">{canvas}</div>
    {open && <>
      <div
        className="production-workbench-resizer"
        role="separator"
        aria-label="Resize Production Workbench"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={Math.floor(window.innerWidth * 0.6)}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
      ><GripVertical aria-hidden="true" /></div>
      <aside className="production-workbench" data-mode={mode} aria-label={`Production Workbench: ${title}`}>
        <header className="production-workbench-header">
          <div><span className="eyebrow">Workbench</span><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <Button variant="ghost" size="icon" aria-label="Close Production Workbench" onClick={onClose}><X /></Button>
        </header>
        <div className="production-workbench-body">{children}</div>
      </aside>
    </>}
    <ProductionFloatingTransport />
  </section>
}
