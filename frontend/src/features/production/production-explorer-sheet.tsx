import { ProductionExplorer } from "@/components/project-explorer"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { HierarchyNode } from "@/types/domain"

export function ProductionExplorerSheet({ open, nodes, activeKey, onOpenChange }: {
  open: boolean
  nodes: HierarchyNode[]
  activeKey: string
  onOpenChange: (open: boolean) => void
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="production-explorer-sheet"><SheetHeader><SheetTitle>Production Explorer</SheetTitle><SheetDescription>Navigate the Venture, Project, Series and Production hierarchy.</SheetDescription></SheetHeader><ProductionExplorer nodes={nodes} activeKey={activeKey} /></SheetContent></Sheet>
}
