import { PanelLeftClose } from "lucide-react"

import { Button } from "@/components/ui/button"

export function WorkstationPaneHeader({ title, meta, onCollapse }: {
  title: string
  meta: string
  onCollapse: () => void
}) {
  return <header className="ws-pane-header">
    <span><b>{title}</b><small>{meta}</small></span>
    <Button variant="ghost" size="icon-sm" aria-label={`Hide ${title.toLowerCase()}`} title={`Hide ${title.toLowerCase()}`} onClick={onCollapse}><PanelLeftClose /></Button>
  </header>
}
