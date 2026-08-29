import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ModelSelectorOption = {
  value: string
  label: string
  provider: string
  description?: string
  iconUrl?: string
}

export function ModelSelector({ options, value, onValueChange, disabled = false, triggerClassName, triggerVariant = "ghost", triggerSize = "xs", contentSide = "top" }: {
  options: ModelSelectorOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  triggerClassName?: string
  triggerVariant?: ComponentProps<typeof Button>["variant"]
  triggerSize?: ComponentProps<typeof Button>["size"]
  contentSide?: ComponentProps<typeof PopoverContent>["side"]
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) || options[0]
  const providers = useMemo(() => [...new Set(options.map(({ provider }) => provider))], [options])

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant={triggerVariant} size={triggerSize} disabled={disabled || !selected} role="combobox" aria-expanded={open} aria-label="Choose generation model" className={cn("max-w-40 justify-between", triggerClassName)}>
        <span className="flex min-w-0 items-center gap-2">{selected?.iconUrl && <img className="size-4 shrink-0 rounded-sm" src={selected.iconUrl} alt="" />}<span className="truncate">{selected?.label || "Choose model"}</span></span><ChevronsUpDown data-icon="inline-end" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side={contentSide} className="w-72 p-0">
      <Command>
        <CommandInput placeholder="Search models" />
        <CommandList>
          <CommandEmpty>No compatible model found.</CommandEmpty>
          {providers.map((provider) => <CommandGroup key={provider} heading={provider}>
            {options.filter((option) => option.provider === provider).map((option) => <CommandItem
              key={option.value}
              value={`${option.label} ${option.provider} ${option.description || ""}`}
              onSelect={() => { onValueChange(option.value); setOpen(false) }}
            >
              <Check className={cn("opacity-0", value === option.value && "opacity-100")} />
              {option.iconUrl && <img className="size-4 shrink-0 rounded-sm" src={option.iconUrl} alt="" />}
              <span className="grid min-w-0 gap-0.5"><span>{option.label}</span>{option.description && <span className="truncate text-xs text-muted-foreground">{option.description}</span>}</span>
            </CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
