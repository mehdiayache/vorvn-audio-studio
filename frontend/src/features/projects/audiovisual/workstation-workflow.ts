import { Clapperboard, Library, ScrollText, type LucideIcon } from "lucide-react"

export type WorkstationStage = "sequence" | "sound" | "library"

export type WorkstationStageDefinition = {
  id: WorkstationStage
  label: string
  description: string
  icon: LucideIcon
}

export const WORKSTATION_STAGES: readonly WorkstationStageDefinition[] = [
  { id: "sequence", label: "Script", description: "Write and record the story", icon: ScrollText },
  { id: "sound", label: "Timeline", description: "Assemble audio and visuals", icon: Clapperboard },
  { id: "library", label: "Library", description: "Find and collect reusable Files", icon: Library },
]
