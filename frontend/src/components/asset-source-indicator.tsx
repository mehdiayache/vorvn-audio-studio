import { Archive, Sparkles, Upload } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { assetProvenance, assetSourcePresentation, type AssetSource } from "@/lib/asset-provenance"
import { cn } from "@/lib/utils"
import type { VentureAsset } from "@/types/domain"

import "./asset-source-indicator.css"

export function FreesoundMark({ className }: { className?: string }) {
  return <img className={cn("freesound-mark", className)} src={`${import.meta.env.BASE_URL}brands/freesound.svg`} alt="" aria-hidden="true" />
}

export function AssetSourceIcon({ source }: { source: AssetSource }) {
  const icon = assetSourcePresentation(source).icon
  if (icon === "sparkles") return <Sparkles />
  if (icon === "freesound") return <FreesoundMark />
  if (icon === "upload") return <Upload />
  return <Archive />
}

export function AssetSourceIndicator({ asset, source: explicitSource, detail: explicitDetail, className, showLabel = false, side = "bottom" }: {
  asset?: VentureAsset
  source?: AssetSource
  detail?: string
  className?: string
  showLabel?: boolean
  side?: "top" | "right" | "bottom" | "left"
}) {
  const provenance = asset ? assetProvenance(asset) : null
  const source = provenance?.source || explicitSource || "library"
  const presentation = provenance?.presentation || assetSourcePresentation(source)
  const detail = explicitDetail || provenance?.detail || presentation.label
  const indicator = <span
    className={cn(className, `is-${source}`, source === "generated" && "is-generated")}
    data-asset-source={source}
    data-source-label={presentation.label}
    tabIndex={0}
    aria-label={`${presentation.label} source`}
  >
    <AssetSourceIcon source={source} />
    {showLabel && <span>{presentation.badgeLabel}</span>}
  </span>
  return <OperatorTooltip label={`${presentation.label} source`} detail={detail} side={side}>{indicator}</OperatorTooltip>
}
