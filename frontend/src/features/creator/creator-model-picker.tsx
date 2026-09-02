import { Check, ChevronDown, Cpu } from "lucide-react"
import { useState } from "react"

import { resolveSpeechModel } from "@/components/speech-model-identity"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

function providerName(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function modelIdentity(route: VoiceChoice, config: StudioConfig | null) {
  return resolveSpeechModel({ provider: route.provider, engine: route.engine, tier: route.model, modelId: route.modelId, config })
}

export function CreatorModelPicker({ routes, selectedRouteId, selectedCapabilityId, config, onSelect }: {
  routes: VoiceChoice[]
  selectedRouteId: string
  selectedCapabilityId: string | null
  config: StudioConfig | null
  onSelect: (route: VoiceChoice, capabilityId?: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = routes.find((route) => route.id === selectedRouteId)
  const groups = [...new Set(routes.map((route) => route.provider))]
  const selectedModel = selected ? modelIdentity(selected, config) : null

  function choose(route: VoiceChoice) {
    const routeKeepsCapability = route.capabilities.some((capability) => capability.id === selectedCapabilityId)
    const capabilityId = routeKeepsCapability
      ? selectedCapabilityId
      : route.capabilities.length === 1 ? route.capabilities[0]!.id : null
    onSelect(route, capabilityId)
    setOpen(false)
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="creator-context-trigger creator-model-trigger" aria-label="Speech model" aria-expanded={open} disabled={!routes.length}>
        <Cpu className="creator-model-mark" />
        <span className="creator-picker-copy">
          <b>{selectedModel ? `${selectedModel.product}${selectedModel.tierName ? ` · ${selectedModel.tierName}` : ""}` : routes.length ? "Choose a model" : "Choose a Voice first"}</b>
          <small>{selectedModel?.modelId || "The exact generation engine will appear here"}</small>
        </span>
        <ChevronDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="creator-picker-popover creator-model-popover" align="start" sideOffset={6}>
      <Command>
        <CommandInput placeholder="Search speech models…" />
        <CommandList>
          <CommandEmpty>No matching speech model.</CommandEmpty>
          {groups.map((provider) => <CommandGroup key={provider} heading={providerName(provider)}>
            {routes.filter((route) => route.provider === provider).map((route) => {
              const model = modelIdentity(route, config)
              return <CommandItem key={route.id} value={`${model.product} ${model.tierName} ${model.modelId} ${provider}`} disabled={!route.compatible} onSelect={() => choose(route)}>
                <Cpu className="creator-model-mark" />
                <span className="creator-picker-copy"><b>{model.product}{model.tierName ? ` · ${model.tierName}` : ""}</b><small>{providerName(provider)}</small><code>{model.modelId}</code></span>
                {selected?.id === route.id && <Check className="creator-picker-check" />}
              </CommandItem>
            })}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
