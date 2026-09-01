import { AssetSourceIndicator } from "@/components/asset-source-indicator"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { ASSET_SOURCE_PRESENTATION, type AssetSource } from "@/lib/asset-provenance"
import { cn } from "@/lib/utils"

import { AUDIO_FAMILY_LABELS, SoundMediaIcon, type AudioFamily } from "./audio-presentation"

import "./audio-identity.css"

export const AUDIO_SOURCE_LABELS: Record<AssetSource, string> = {
  generated: ASSET_SOURCE_PRESENTATION.generated.badgeLabel,
  freesound: ASSET_SOURCE_PRESENTATION.freesound.badgeLabel,
  uploaded: ASSET_SOURCE_PRESENTATION.uploaded.badgeLabel,
  library: ASSET_SOURCE_PRESENTATION.library.badgeLabel,
}

export { AssetSourceIcon as AudioSourceIcon, FreesoundMark } from "@/components/asset-source-indicator"

export function AudioSourceBadge({ source, detail, className }: { source: AssetSource; detail?: string; className?: string }) {
  return <AssetSourceIndicator source={source} detail={detail} className={cn("audio-source-badge", className)} showLabel />
}

export function AudioFamilyBadge({ family, suggested = false, className }: { family: AudioFamily; suggested?: boolean; className?: string }) {
  const label = AUDIO_FAMILY_LABELS[family]
  const badge = <span className={cn("audio-family-badge", className)} data-family={family} tabIndex={suggested ? 0 : undefined} aria-label={`${suggested ? "Suggested " : ""}${label} family`}>
    <SoundMediaIcon kind={family} />
    <span>{label}</span>
  </span>
  return suggested ? <OperatorTooltip label={`Suggested ${label}`} detail="Based on the result name and Freesound tags. You can change it before keeping the Asset." side="bottom">{badge}</OperatorTooltip> : badge
}
