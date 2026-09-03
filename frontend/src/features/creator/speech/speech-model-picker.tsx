import { resolveSpeechModel } from "@/components/speech-model-identity"
import { ModelSelector } from "@/components/ai/model-selector"
import { speechModelKey, type VoiceChoice } from "@/lib/voice-options"
import type { StudioConfig } from "@/types/domain"

function providerName(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function modelIdentity(route: VoiceChoice, config: StudioConfig | null) {
  return resolveSpeechModel({ provider: route.provider, engine: route.engine, tier: route.model, modelId: route.modelId, config })
}

export function SpeechModelPicker({ routes, selectedModelKey, selectedCapabilityId, config, onSelect }: {
  routes: VoiceChoice[]
  selectedModelKey: string
  selectedCapabilityId: string | null
  config: StudioConfig | null
  onSelect: (route: VoiceChoice, capabilityId?: string | null) => void
}) {
  const options = routes.map((route) => {
    const model = modelIdentity(route, config)
    return {
      value: speechModelKey(route),
      label: `${model.product}${model.tierName ? ` · ${model.tierName}` : ""}`,
      provider: providerName(route.provider),
      description: model.modelId,
    }
  })

  return <ModelSelector
    options={options}
    value={selectedModelKey}
    ariaLabel="Speech model"
    searchPlaceholder="Search speech models…"
    triggerClassName="creator-model-trigger"
    triggerVariant="outline"
    triggerSize="default"
    contentSide="bottom"
    onValueChange={(value) => {
      const selected = routes.find((route) => speechModelKey(route) === value)
      if (!selected) return
      const routeKeepsCapability = selected.capabilities.some((capability) => capability.id === selectedCapabilityId)
      onSelect(selected, routeKeepsCapability ? selectedCapabilityId : selected.capabilities[0]?.id || null)
    }}
  />
}
