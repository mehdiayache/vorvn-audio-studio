import { Check, ChevronsUpDown, Cpu, LoaderCircle } from "lucide-react"
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

export function ModelSelector({ options, value, onValueChange, disabled = false, loading = false, ariaLabel = "Choose generation model", searchPlaceholder = "Search models", triggerClassName, triggerVariant = "ghost", triggerSize = "xs", contentSide = "top" }: {
  options: ModelSelectorOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  loading?: boolean
  ariaLabel?: string
  searchPlaceholder?: string
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
      <Button variant={triggerVariant} size={triggerSize} disabled={disabled || loading || !selected} role="combobox" aria-busy={loading || undefined} aria-expanded={open} aria-label={ariaLabel} className={cn("max-w-40 justify-between", triggerClassName)}>
        <span className="flex min-w-0 items-center gap-2">{loading ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : selected?.iconUrl ? <img className="size-4 shrink-0 rounded-sm" src={selected.iconUrl} alt="" /> : <Cpu className="size-4 shrink-0 text-primary" aria-hidden="true" />}<span className="truncate">{loading ? "Loading models…" : selected?.label || "Choose model"}</span></span><ChevronsUpDown data-icon="inline-end" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side={contentSide} className="w-72 p-0">
      <Command>
        <CommandInput placeholder={searchPlaceholder} />
        <CommandList>
          <CommandEmpty>No compatible model found.</CommandEmpty>
          {providers.map((provider) => <CommandGroup key={provider} heading={provider}>
            {options.filter((option) => option.provider === provider).map((option) => {
              const choose = () => { onValueChange(option.value); setOpen(false) }
              return <CommandItem
              key={option.value}
              value={`${option.label} ${option.provider} ${option.description || ""}`}
              onClick={choose}
              onSelect={choose}
            >
              <Check className={cn("opacity-0", value === option.value && "opacity-100")} />
              {option.iconUrl ? <img className="size-4 shrink-0 rounded-sm" src={option.iconUrl} alt="" /> : <Cpu className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              <span className="grid min-w-0 gap-0.5"><span>{option.label}</span>{option.description && <span className="truncate text-xs text-muted-foreground">{option.description}</span>}</span>
            </CommandItem>})}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
