import { Archive, Sparkles, Upload } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { fileProvenance, fileSourcePresentation, type FileSource, type FileSourceIconName } from "@/lib/file-provenance"
import { cn } from "@/lib/utils"
import type { WorkspaceFile } from "@/types/domain"

import "./file-source-indicator.css"

export function FreesoundMark({ className }: { className?: string }) {
  return <img className={cn("freesound-mark", className)} src={`${import.meta.env.BASE_URL}brands/freesound.svg`} alt="" aria-hidden="true" />
}

export function FileSourceIcon({ source, icon = fileSourcePresentation(source).icon }: { source: FileSource; icon?: FileSourceIconName }) {
  if (icon === "sparkles") return <Sparkles />
  if (icon === "freesound") return <FreesoundMark />
  if (icon === "upload") return <Upload />
  return <Archive />
}

export function FileSourceIndicator({ file, source: explicitSource, providerId, detail: explicitDetail, className, showLabel = false, side = "bottom" }: {
  file?: WorkspaceFile
  source?: FileSource
  providerId?: string
  detail?: string
  className?: string
  showLabel?: boolean
  side?: "top" | "right" | "bottom" | "left"
}) {
  const provenance = file ? fileProvenance(file) : null
  const source = provenance?.source || explicitSource || "uploaded"
  const basePresentation = fileSourcePresentation(source)
  const presentation = provenance?.presentation || (source === "imported" && providerId?.toLowerCase() === "freesound"
    ? { ...basePresentation, icon: "freesound" as const }
    : basePresentation)
  const detail = explicitDetail || provenance?.detail || presentation.label
  const indicator = <span
    className={cn(className, `is-${source}`, source === "generated" && "is-generated")}
    data-file-source={source}
    data-source-label={presentation.label}
    tabIndex={0}
    aria-label={`${presentation.label} source`}
  >
    <FileSourceIcon source={source} icon={presentation.icon} />
    {showLabel && <span>{presentation.badgeLabel}</span>}
  </span>
  return <OperatorTooltip label={`${presentation.label} source`} detail={detail} side={side}>{indicator}</OperatorTooltip>
}
