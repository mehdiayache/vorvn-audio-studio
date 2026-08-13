import type { ReactNode } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  return <section className="production-workstation">
    <div className="production-canvas">{canvas}</div>
    <Dialog open={Boolean(mode)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="production-stage" data-mode={mode} showCloseButton>
        <DialogHeader className="production-stage-header">
          <span className="eyebrow">Production</span>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="production-stage-body">{children}</div>
      </DialogContent>
    </Dialog>
    <ProductionFloatingTransport previewStale={previewStale} onRefreshPreview={onRefreshPreview} onOpenCaptionContext={onOpenCaptionContext} />
  </section>
}
