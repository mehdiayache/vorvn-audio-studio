import { Check, ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"

import { resolveSpeechModel } from "@/components/speech-model-identity"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { VoiceCapabilityChoice, VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

type MethodChoice = {
  id: string
  route: VoiceChoice
  capability: VoiceCapabilityChoice | null
  capabilityId: string | null
}

function providerName(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function CreatorMethodPicker({ routes, availableRoutes, selectedRouteId, selectedCapabilityId, language, customVoice, config, onSelect }: {
  routes: VoiceChoice[]
  availableRoutes: VoiceChoice[]
  selectedRouteId: string
  selectedCapabilityId: string | null
  language: string
  customVoice: boolean
  config: StudioConfig | null
  onSelect: (route: VoiceChoice, capabilityId?: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const methods = useMemo(() => routes.flatMap((route) => {
    const capabilities = route.capabilities.length ? route.capabilities : [null]
    return capabilities.map((capability) => ({
      id: `${route.id}:${capability?.id || "default"}`,
      route,
      capability,
      capabilityId: capability?.id || null,
    }))
  }), [routes])
  const selected = methods.find((method) => method.route.id === selectedRouteId && (
    method.capabilityId === selectedCapabilityId
    || (!selectedCapabilityId && method.route.capabilities.length === 1)
  ))
  const groups = [...new Set(methods.map((method) => method.route.provider))]

  function modelLabel(route: VoiceChoice) {
    const resolved = resolveSpeechModel({ provider: route.provider, engine: route.engine, tier: route.model, modelId: route.modelId, config })
    return `${resolved.product}${resolved.tierName ? ` · ${resolved.tierName}` : ""}`
  }

  function exactModel(route: VoiceChoice) {
    return resolveSpeechModel({ provider: route.provider, engine: route.engine, tier: route.model, modelId: route.modelId, config }).modelId
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="creator-context-trigger creator-method-trigger" aria-label="Recording method" aria-expanded={open} disabled={!routes.length}>
        <span className="creator-method-mark" aria-hidden="true">●</span>
        <span className="creator-picker-copy"><b>{selected?.capability?.name || (routes.length ? "Choose recording method" : "Choose a Voice first")}</b><small>{selected ? `${providerName(selected.route.provider)} · ${modelLabel(selected.route)} · ${exactModel(selected.route)}` : "Exact route required"}</small></span>
        <ChevronDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="creator-picker-popover creator-method-popover" align="start" sideOffset={6}>
      <Command>
        <CommandInput placeholder="Search recording methods…" />
        <CommandList>
          <CommandEmpty>No matching recording method.</CommandEmpty>
          {groups.map((provider) => <CommandGroup key={provider} heading={providerName(provider)}>
            {methods.filter((method) => method.route.provider === provider).map((method) => {
              const available = availableRoutes.some((route) => route.id === method.route.id)
              const documented = voiceLanguageStatus(method.route, language, customVoice) === "documented"
              return <CommandItem key={method.id} value={`${method.capability?.name || "Recording method"} ${modelLabel(method.route)} ${method.route.modelId}`} disabled={!available} onSelect={() => { onSelect(method.route, method.capabilityId); setOpen(false) }}>
                <span className="creator-method-mark" aria-hidden="true">●</span>
                <span className="creator-picker-copy"><b>{method.capability?.name || "Recording method"}</b><small>{modelLabel(method.route)} · {documented ? `${language} documented` : `${language} not documented`}</small><code>{exactModel(method.route)}</code>{method.capability?.description && <em>{method.capability.description}</em>}</span>
                {selected?.id === method.id && <Check className="creator-picker-check" />}
              </CommandItem>
            })}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
