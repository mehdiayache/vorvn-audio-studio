import { Check, ChevronDown, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { operationLabel, type DirectorOperation, type DirectorOperationInfo } from "./director-composer-config"

export function DirectorOperationPicker({ operations, value, onValueChange }: { operations: DirectorOperationInfo[]; value: DirectorOperation; onValueChange: (value: DirectorOperation) => void }) {
  return <DropdownMenu>
    <OperatorTooltip label="Creation type" detail="Choose what Director should make from this prompt.">
      <DropdownMenuTrigger asChild><Button variant="ghost" size="xs" aria-label={`Creation type: ${operationLabel(operations, value)}`}><WandSparkles data-icon="inline-start" />{operationLabel(operations, value)}<ChevronDown data-icon="inline-end" /></Button></DropdownMenuTrigger>
    </OperatorTooltip>
    <DropdownMenuContent side="top" align="start" className="w-64">
      <DropdownMenuLabel>Create</DropdownMenuLabel>
      <DropdownMenuGroup>{operations.map((operation) => {
        return <DropdownMenuItem key={operation.id} onSelect={() => onValueChange(operation.id)}>
          <WandSparkles /><span className="grid min-w-0 gap-0.5"><span>{operation.label}</span><span className="text-xs text-muted-foreground">{operation.detail}</span></span>{operation.id === value && <Check className="ml-auto" />}
        </DropdownMenuItem>
      })}</DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
