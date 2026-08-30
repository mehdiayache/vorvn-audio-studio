import { Archive, Sparkles, Upload } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import type { AssetSource } from "@/lib/asset-provenance"
import { cn } from "@/lib/utils"

import { AUDIO_FAMILY_LABELS, SoundMediaIcon, type AudioFamily } from "./audio-presentation"

import "./audio-identity.css"

export const AUDIO_SOURCE_LABELS: Record<AssetSource, string> = {
  generated: "AI",
  freesound: "Freesound",
  uploaded: "Upload",
  library: "Imported",
}

export function FreesoundMark({ className }: { className?: string }) {
  return <img className={cn("freesound-mark", className)} src={`${import.meta.env.BASE_URL}brands/freesound.svg`} alt="" aria-hidden="true" />
}

export function AudioSourceIcon({ source }: { source: AssetSource }) {
  if (source === "generated") return <Sparkles />
  if (source === "freesound") return <FreesoundMark />
  if (source === "uploaded") return <Upload />
  return <Archive />
}

export function AudioSourceBadge({ source, detail, className }: { source: AssetSource; detail?: string; className?: string }) {
  const label = AUDIO_SOURCE_LABELS[source]
  const badge = <span className={cn("audio-source-badge", `is-${source}`, className)} tabIndex={detail ? 0 : undefined} aria-label={`${label} source`}>
    <AudioSourceIcon source={source} />
    <span>{label}</span>
  </span>
  return detail ? <OperatorTooltip label={`${label} source`} detail={detail} side="bottom">{badge}</OperatorTooltip> : badge
}

export function AudioFamilyBadge({ family, suggested = false, className }: { family: AudioFamily; suggested?: boolean; className?: string }) {
  const label = AUDIO_FAMILY_LABELS[family]
  const badge = <span className={cn("audio-family-badge", className)} data-family={family} tabIndex={suggested ? 0 : undefined} aria-label={`${suggested ? "Suggested " : ""}${label} family`}>
    <SoundMediaIcon kind={family} />
    <span>{label}</span>
  </span>
  return suggested ? <OperatorTooltip label={`Suggested ${label}`} detail="Based on the result name and Freesound tags. You can change it before keeping the Asset." side="bottom">{badge}</OperatorTooltip> : badge
}
