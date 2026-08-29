import { Clapperboard, ScrollText, Sparkles, type LucideIcon } from "lucide-react"

export type WorkstationStage = "sequence" | "sound" | "director"

export type WorkstationStageDefinition = {
  id: WorkstationStage
  label: string
  description: string
  icon: LucideIcon
}

export const WORKSTATION_STAGES: readonly WorkstationStageDefinition[] = [
  { id: "sequence", label: "Script", description: "Write and record the story", icon: ScrollText },
  { id: "sound", label: "Timeline", description: "Assemble audio and visuals", icon: Clapperboard },
  { id: "director", label: "Director", description: "Create and collect visuals", icon: Sparkles },
]
