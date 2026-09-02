import { ModelSelector } from "@/components/ai/model-selector"
import type { MediaModelFamily } from "./media-creator-config"

export function mediaModelOptions(models: MediaModelFamily[]) {
  return models.map((model) => ({
    value: model.id, label: model.label, provider: model.provider,
    description: model.description, iconUrl: model.presentation?.icon_url,
  }))
}

export function MediaModelSelector({ models, value, onValueChange }: { models: MediaModelFamily[]; value: string; onValueChange: (value: string) => void }) {
  return <ModelSelector
    options={mediaModelOptions(models)}
    value={value}
    onValueChange={onValueChange}
    triggerClassName="media-model-trigger"
    triggerVariant="outline"
    triggerSize="default"
    contentSide="bottom"
  />
}
