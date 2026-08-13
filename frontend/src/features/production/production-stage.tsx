import { useEffect, useId, useRef, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProductionFloatingTransport } from "@/features/production/production-floating-transport"

export type ProductionStageMode =
  | "composer"
  | "part"
  | "cast"
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
  useEffect(() => {
    if (mode) window.requestAnimationFrame(() => backRef.current?.focus())
  }, [mode])

  return <section className="production-workstation">
    <div className="production-canvas" aria-hidden={Boolean(mode)} inert={mode ? true : undefined}>{canvas}</div>
    {mode && <section className="production-stage" data-mode={mode} aria-labelledby={titleId}>
      <header className="production-stage-header">
        <div className="production-stage-header-inner">
          <Button ref={backRef} variant="ghost" size="icon" onClick={onClose} aria-label="Back to Production sequence"><ArrowLeft /></Button>
          <div><span className="eyebrow">Production</span><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        </div>
      </header>
      <div className="production-stage-body"><div className="production-stage-frame">{children}</div></div>
    </section>}
    <ProductionFloatingTransport previewStale={previewStale} onRefreshPreview={onRefreshPreview} onOpenCaptionContext={onOpenCaptionContext} />
  </section>
}
