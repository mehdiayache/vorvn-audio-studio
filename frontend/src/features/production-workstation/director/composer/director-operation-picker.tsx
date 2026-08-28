import { Check, ChevronDown, Image, Images, MessageSquareText, PanelsTopLeft, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { DIRECTOR_OPERATIONS, operationLabel, type DirectorOperation } from "./director-composer-config"

const operationIcons = {
  image: Image,
  "image-to-video": Video,
  "frames-to-video": PanelsTopLeft,
  "reference-video": Images,
  "talking-video": MessageSquareText,
}

export function DirectorOperationPicker({ value, onValueChange }: { value: DirectorOperation; onValueChange: (value: DirectorOperation) => void }) {
  const ActiveIcon = operationIcons[value]
  return <DropdownMenu>
    <OperatorTooltip label="Creation type" detail="Choose what Director should make from this prompt.">
      <DropdownMenuTrigger asChild><Button variant="ghost" size="xs" aria-label={`Creation type: ${operationLabel(value)}`}><ActiveIcon data-icon="inline-start" />{operationLabel(value)}<ChevronDown data-icon="inline-end" /></Button></DropdownMenuTrigger>
    </OperatorTooltip>
    <DropdownMenuContent side="top" align="start" className="w-64">
      <DropdownMenuLabel>Create</DropdownMenuLabel>
      <DropdownMenuGroup>{DIRECTOR_OPERATIONS.map((operation) => {
        const Icon = operationIcons[operation.id]
        return <DropdownMenuItem key={operation.id} onSelect={() => onValueChange(operation.id)}>
          <Icon /><span className="grid min-w-0 gap-0.5"><span>{operation.label}</span><span className="text-xs text-muted-foreground">{operation.detail}</span></span>{operation.id === value && <Check className="ml-auto" />}
        </DropdownMenuItem>
      })}</DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
