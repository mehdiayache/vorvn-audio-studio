import { ModelSelector } from "@/components/ai/model-selector"
import type { DirectorModelCapability } from "./director-composer-config"

export function DirectorModelSelector({ models, value, onValueChange }: { models: DirectorModelCapability[]; value: string; onValueChange: (value: string) => void }) {
  return <ModelSelector
    options={models.map((model) => ({ value: model.id, label: model.label, provider: model.provider, description: model.description }))}
    value={value}
    onValueChange={onValueChange}
  />
}
