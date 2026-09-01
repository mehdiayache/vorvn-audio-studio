import { ArrowLeft, Music2, Waves } from "lucide-react"
import { Link, Navigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import type { GeneratedKeepInput } from "@/components/production-tools/asset-tool"
import { GenerationWorkspace } from "@/components/production-tools/generation-workspace"
import "@/components/production-tools/production-tools.css"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { useSpaceHome } from "@/hooks/use-space-home"
import { studioApi } from "@/lib/api"
import type { AudioAssetCategory } from "@/types/domain"

import "./space-audio-creation.css"

const audioActions = {
  "generate-music": {
    capability: "music" as const,
    icon: Music2,
    title: "Generate music",
    description: "Create a reusable music File directly in this Space.",
  },
  "generate-sound-effect": {
    capability: "sfx" as const,
    icon: Waves,
    title: "Generate a sound effect",
    description: "Create Foley, ambience, impacts or transitions without opening a Project.",
  },
}

export function SpaceAudioCreationPage() {
  const { actionId = "" } = useParams()
  const action = audioActions[actionId as keyof typeof audioActions]
  const { spaces, overview, selectedSpaceId, refresh } = useSpaceHome()
  const player = useGlobalPlayer()

  if (!action) return <Navigate replace to="/audio-studio/" />
  if (spaces.status === "loading" || (selectedSpaceId && overview.status === "loading" && !overview.data)) {
    return <PageLoading label={`Opening ${action.title}`} />
  }
  if (!selectedSpaceId) {
    return <ErrorState title="Choose a Space first" message="Create or select a Space before generating reusable Files." retry={() => window.location.assign("/audio-studio/")} />
  }
  if (overview.status === "error" && !overview.data) {
    return <ErrorState title="Space unavailable" message={overview.error || "This Space could not be loaded."} retry={() => void refresh()} />
  }

  const Icon = action.icon
  const spaceName = overview.data?.space.name || spaces.data?.find((space) => space.id === selectedSpaceId)?.name || "Current Space"

  async function keepGeneratedFile(_folder: string, input: GeneratedKeepInput) {
    return studioApi.keepGeneratedAudioInSpace(input.candidateId, selectedSpaceId!, {
      name: input.name,
      category: input.category,
      tags: input.tags,
    })
  }

  async function fileKept(_file: unknown, category: AudioAssetCategory) {
    await refresh()
    toast.success(`${category === "music" ? "Music" : "Sound effect"} saved to Files.`, {
      description: `It is now reusable everywhere in ${spaceName}.`,
    })
  }

  return <section className="space-audio-creation">
    <header className="space-audio-creation-header">
      <Button asChild variant="ghost" size="sm"><Link to="/audio-studio/"><ArrowLeft />Create</Link></Button>
      <span className={`space-audio-creation-icon is-${action.capability}`}><Icon /></span>
      <div><h1>{action.title}</h1><p>{action.description}</p></div>
      <span className="space-audio-creation-space"><small>Saving to</small><b>{spaceName}</b></span>
    </header>
    <div className="space-audio-creation-workspace">
      <GenerationWorkspace
        key={action.capability}
        mode="sound"
        spaceId={selectedSpaceId}
        fixedCapability={action.capability}
        allowPlacement={false}
        playingKey={player.source?.key}
        playerPlaying={player.state === "playing"}
        onPlay={(source) => void player.toggleSource(source)}
        onKeep={keepGeneratedFile}
        onKept={fileKept}
      />
    </div>
  </section>
}
