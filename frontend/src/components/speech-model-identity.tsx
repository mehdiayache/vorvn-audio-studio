import { cn } from "@/lib/utils"
import type { StudioConfig } from "@/types/domain"

import "./speech-model-identity.css"

type ModelIdentityInput = {
  engine?: string | null
  tier?: string | null
  model?: string | null
  modelId?: string | null
  config?: StudioConfig | null
}

const TIERS = new Set(["plus", "flash", "vc"])

export function speechProductName(engine?: string | null) {
  if (engine === "audio") return "Qwen Audio 3.0 TTS"
  if (engine === "omni") return "Qwen 3.5 Omni"
  if (engine === "qwen_tts") return "Qwen3 TTS Voice Clone"
  if (engine === "text") return "Qwen Text"
  return "Model"
}

export function speechTierName(tier?: string | null) {
  if (tier === "plus") return "Plus"
  if (tier === "flash") return "Flash"
  if (tier === "vc") return "Voice Clone"
  return tier || ""
}

function inferEngine(modelId: string) {
  if (modelId.startsWith("qwen-audio-")) return "audio"
  if (modelId.startsWith("qwen3.5-omni-")) return "omni"
  if (modelId.startsWith("qwen3-tts-vc-")) return "qwen_tts"
  if (modelId.startsWith("qwen")) return "text"
  return ""
}

function inferTier(modelId: string) {
  if (modelId.includes("-flash")) return "flash"
  if (modelId.includes("-plus")) return "plus"
  if (modelId.startsWith("qwen3-tts-vc-")) return "vc"
  return ""
}

export function resolveSpeechModel(input: ModelIdentityInput) {
  const supplied = String(input.modelId || input.model || "")
  const suppliedIsTier = TIERS.has(supplied)
  const engine = input.engine || inferEngine(supplied)
  const tier = input.tier || (suppliedIsTier ? supplied : inferTier(supplied))
  const modelId = input.modelId
    || (!suppliedIsTier ? supplied : "")
    || (engine && tier ? input.config?.capabilities?.[engine]?.models?.[tier] : "")
    || ""
  return {
    engine,
    tier,
    modelId,
    product: speechProductName(engine),
    tierName: speechTierName(tier),
  }
}

export function SpeechModelIdentity({ engine, tier, model, modelId, config, compact = false, className }: ModelIdentityInput & { compact?: boolean; className?: string }) {
  const resolved = resolveSpeechModel({ engine, tier, model, modelId, config })
  if (!resolved.modelId && !resolved.engine) return null
  return <span className={cn("speech-model-identity", compact && "compact", className)}>
    <span>{resolved.product}{resolved.tierName ? ` · ${resolved.tierName}` : ""}</span>
    {resolved.modelId && <code>{resolved.modelId}</code>}
  </span>
}
