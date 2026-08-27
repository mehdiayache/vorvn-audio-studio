import { Download } from "lucide-react"
import type { MouseEventHandler } from "react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AudioDownloadButton({ url, label, detail = "Downloads the original audio file.", compact = false, className, onClick }: {
  url: string
  label: string
  detail?: string
  compact?: boolean
  className?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  return <OperatorTooltip label={`Download ${label}`} detail={detail}>
    <Button variant="ghost" size={compact ? "icon-sm" : "icon"} className={cn("audio-download-button", className)} asChild>
      <a href={url} download aria-label={`Download ${label}`} onClick={onClick}><Download data-icon="inline-start" /></a>
    </Button>
  </OperatorTooltip>
}
