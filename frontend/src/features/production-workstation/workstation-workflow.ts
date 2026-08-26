import { AudioLines, Clapperboard, ListMusic, SlidersHorizontal, type LucideIcon } from "lucide-react"

export type WorkstationStage = "sequence" | "director" | "sound" | "mix"

export type WorkstationStageDefinition = {
  id: WorkstationStage
  label: string
  description: string
  icon: LucideIcon
}

export const WORKSTATION_STAGES: readonly WorkstationStageDefinition[] = [
  { id: "sequence", label: "Script", description: "Voice and story", icon: ListMusic },
  { id: "director", label: "Director", description: "Create and collect visuals", icon: Clapperboard },
  { id: "sound", label: "Timeline", description: "Assemble the production", icon: AudioLines },
  { id: "mix", label: "Export", description: "Finish and deliver", icon: SlidersHorizontal },
]
