import { Check, ChevronDown, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { VoiceChoice } from "@/lib/voice-options"

export function CreatorMethodPicker({ route, selectedCapabilityId, onSelect }: {
  route: VoiceChoice | undefined
  selectedCapabilityId: string | null
  onSelect: (route: VoiceChoice, capabilityId?: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const methods = route?.capabilities || []
  const selected = methods.find((method) => method.id === selectedCapabilityId)
    || (methods.length === 1 ? methods[0] : null)

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="creator-context-trigger creator-method-trigger" aria-label="Recording mode" aria-expanded={open} disabled={!route}>
        <SlidersHorizontal className="creator-method-mark" />
        <span className="creator-picker-copy">
          <b>{selected?.name || (route ? "Choose a recording mode" : "Choose a Voice first")}</b>
          <small>{selected?.description || "Performance controls depend on this mode"}</small>
        </span>
        <ChevronDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="creator-picker-popover creator-method-popover" align="start" sideOffset={6}>
      <Command>
        <CommandList>
          <CommandEmpty>No recording mode is available for this model.</CommandEmpty>
          <CommandGroup heading="Recording mode">
            {methods.map((method) => <CommandItem key={method.id} value={`${method.name} ${method.description}`} onSelect={() => { onSelect(route!, method.id); setOpen(false) }}>
              <SlidersHorizontal className="creator-method-mark" />
              <span className="creator-picker-copy"><b>{method.name}</b>{method.description && <small>{method.description}</small>}</span>
              {selected?.id === method.id && <Check className="creator-picker-check" />}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
