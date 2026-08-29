import { ModelSelector } from "@/components/ai/model-selector"
import type { DirectorModelFamily } from "./director-composer-config"

export function directorModelOptions(models: DirectorModelFamily[]) {
  return models.map((model) => ({
    value: model.id, label: model.label, provider: model.provider,
    description: model.description, iconUrl: model.presentation?.icon_url,
  }))
}

export function DirectorModelSelector({ models, value, onValueChange }: { models: DirectorModelFamily[]; value: string; onValueChange: (value: string) => void }) {
  return <ModelSelector
    options={directorModelOptions(models)}
    value={value}
    onValueChange={onValueChange}
    triggerClassName="director-model-trigger"
    triggerVariant="outline"
    triggerSize="default"
    contentSide="bottom"
  />
}
