import type { ReactElement } from "react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function OperatorTooltip({ label, detail, children, side = "top", disabledTrigger = false }: {
  label: string
  detail?: string
  children: ReactElement
  side?: "top" | "right" | "bottom" | "left"
  disabledTrigger?: boolean
}) {
  return <TooltipProvider delayDuration={300}><Tooltip>
      <TooltipTrigger asChild>{disabledTrigger ? <span className="inline-flex items-center justify-center" tabIndex={0}>{children}</span> : children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={7} className="grid max-w-72 gap-0.5">
        <b className="font-medium">{label}</b>
        {detail && <span className="text-background/75">{detail}</span>}
      </TooltipContent>
    </Tooltip></TooltipProvider>
}
