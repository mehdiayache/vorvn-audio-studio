import { PanelLeftClose } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OperatorTooltip } from "@/components/operator-tooltip"

export function WorkstationPaneHeader({ title, meta, onCollapse }: {
  title: string
  meta: string
  onCollapse: () => void
}) {
  return <header className="ws-pane-header">
    <span><b>{title}</b><small>{meta}</small></span>
    <OperatorTooltip label={`Hide ${title.toLowerCase()}`}><Button variant="ghost" size="icon-sm" aria-label={`Hide ${title.toLowerCase()}`} onClick={onCollapse}><PanelLeftClose /></Button></OperatorTooltip>
  </header>
}
