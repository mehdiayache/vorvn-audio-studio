import { useEffect, useId, useRef, type ReactNode } from "react"
import { ArrowLeft, PanelRightClose } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"

export type ProductionStageMode =
  | "composer"
  | "part"
  | "music"
  | "health"
  | "mix-export"

export function ProductionStage({ mode, title, description, onClose, children, canvas, previewStale, onRefreshPreview, onOpenCaptionContext }: {
  mode: ProductionStageMode | null
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  canvas: ReactNode
  previewStale?: boolean
  onRefreshPreview?: () => void
  onOpenCaptionContext?: (partId: number) => void
}) {
  const titleId = useId()
  const backRef = useRef<HTMLButtonElement>(null)
  const docked = mode === "part" || mode === "composer"
  useEffect(() => {
    if (!mode) return
    const frame = window.requestAnimationFrame(() => backRef.current?.focus())
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [mode, onClose])

  return <section className="production-workstation" data-stage-layout={docked ? "docked" : mode ? "overlay" : "canvas"} data-stage-mode={mode || undefined}>
    <div className="production-canvas" aria-hidden={Boolean(mode && !docked)} inert={mode && !docked ? true : undefined}>{canvas}</div>
    {mode && <section className="production-stage" data-mode={mode} aria-labelledby={titleId}>
      <header className="production-stage-header">
        <div className="production-stage-header-inner">
          <Button ref={backRef} variant="ghost" size="icon" onClick={onClose} aria-label={docked ? "Close Production panel" : "Back to Production sequence"}>{docked ? <PanelRightClose /> : <ArrowLeft />}</Button>
          <div><span className="eyebrow">Production</span><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        </div>
      </header>
      <div className="production-stage-body"><div className="production-stage-frame">{children}</div></div>
    </section>}
    <ProductionFloatingTransport previewStale={previewStale} onRefreshPreview={onRefreshPreview} onOpenCaptionContext={onOpenCaptionContext} />
  </section>
}
