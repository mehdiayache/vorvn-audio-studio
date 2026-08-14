import type { PlayerSource, ProductionPart } from "@/types/domain"

export type PartDetailTab = "script" | "captions" | "details"

export type SequenceActions = {
  play: (source: PlayerSource) => void
  duplicate: (part: ProductionPart) => void
  remove: (part: ProductionPart) => void
  move: (part: ProductionPart, direction: -1 | 1) => void
  moveToPosition: (part: ProductionPart) => void
  editSilence: (part: ProductionPart, seconds: number) => void
  setEnabled?: (part: ProductionPart, enabled: boolean) => void
  openPart: (part: ProductionPart, tab?: PartDetailTab) => void
  recordPart?: (part: ProductionPart) => void
}

export type InsertKind = "speech" | "asset" | "silence"
