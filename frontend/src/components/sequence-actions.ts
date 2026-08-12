import type { PlayerSource, ProductionPart } from "@/types/domain"

export type SequenceActions = {
  play: (source: PlayerSource) => void
  duplicate: (part: ProductionPart) => void
  remove: (part: ProductionPart) => void
  move: (part: ProductionPart, direction: -1 | 1) => void
  moveToPosition: (part: ProductionPart) => void
  editSilence: (part: ProductionPart, seconds: number) => void
  openPart: (part: ProductionPart) => void
}

export type InsertKind = "speech" | "asset" | "silence"
