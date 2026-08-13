import type { PlayerSource, ProductionPart } from "@/types/domain"

export type PartDetailTab = "script" | "takes" | "captions" | "details"

export type SequenceActions = {
  play: (source: PlayerSource) => void
  duplicate: (part: ProductionPart) => void
  remove: (part: ProductionPart) => void
  move: (part: ProductionPart, direction: -1 | 1) => void
  moveToPosition: (part: ProductionPart) => void
  editSilence: (part: ProductionPart, seconds: number) => void
  openPart: (part: ProductionPart, tab?: PartDetailTab) => void
  newTake?: (part: ProductionPart) => void
}

export type InsertKind = "speech" | "asset" | "silence"
