import { ArrowLeft, Captions, Mic2, Music2, WandSparkles, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { lazy, Suspense, useMemo } from "react"
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { AudioCreator } from "@/features/creator/audio/audio-creator"
import { MediaCreator } from "@/features/creator/media/media-creator"
import type { GeneratedKeepInput } from "@/features/workspace/library/audio-library"
import "@/features/workspace/library/audio-library.css"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { AudioFileCategory, WorkspaceFile, WorkspaceFileSummary } from "@/types/domain"

import "./create-creator-page.css"

const SpeechCreator = lazy(() => import("@/features/creator/speech/speech-creator-page").then((module) => ({ default: module.SpeechCreatorPage })))
const SubtitleCreator = lazy(() => import("@/features/creator/subtitles/subtitle-creator-page").then((module) => ({ default: module.SubtitleCreatorPage })))

type CreateCreatorAction = {
  capability: "speech" | "music" | "sfx" | "media" | "subtitle"
  icon: LucideIcon
  title: string
  description: string
}

const creatorActions: Record<string, CreateCreatorAction> = {
  "generate-speech": {
    capability: "speech",
    icon: Mic2,
    title: "Generate speech",
    description: "Create reusable speech audio with the voice, language and performance controls it needs.",
  },
  "generate-music": {
    capability: "music",
    icon: Music2,
    title: "Generate music",
    description: "Create a reusable music File in this Workspace.",
  },
  "generate-sound-effect": {
    capability: "sfx",
    icon: Waves,
    title: "Generate a sound effect",
    description: "Create Foley, ambience, impacts or transitions.",
  },
  "generate-media": {
    capability: "media",
    icon: WandSparkles,
    title: "Generate media",
    description: "Create images or videos with one model-aware Creator.",
  },
  "create-subtitles": {
    capability: "subtitle",
    icon: Captions,
    title: "Create subtitles",
    description: "Transcribe external audio into reusable subtitle Files.",
  },
}

function editorFile(file: WorkspaceFileSummary): WorkspaceFile {
  const version = file.current_version
  return {
    id: file.id,
    public_id: file.public_id,
    name: file.name,
    title: file.name,
    folder_id: file.folder_id,
    source: file.source,
    tags: file.tags,
    metadata: file.metadata,
    version_metadata: {},
    created_at: file.created_at,
    updated_at: file.updated_at,
    version_id: version.id,
    filename: version.filename,
    url: version.url,
    size_bytes: version.size_bytes,
    duration_ms: version.duration_ms,
    mime_type: version.mime_type,
    media_type: version.family === "image" || version.family === "video" ? version.family : "audio",
    width: version.width,
    height: version.height,
  }
}

export function CreateCreatorPage() {
  const { actionId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const action = creatorActions[actionId]
  const { workspaces, overview, selectedWorkspaceId, refresh } = useWorkspaceExplorer()
  const player = useGlobalPlayer()
  const folderId = Number(searchParams.get("folder_id") || 0) || null
  const context = useMemo<CreatorContext | null>(() => selectedWorkspaceId ? ({
    workspace_id: selectedWorkspaceId,
    folder_id: folderId,
    selection: action && action.capability !== "media" ? { capability: action.capability } : {},
  }) : null, [action, folderId, selectedWorkspaceId])

  if (!action) return <Navigate replace to="/origins/" />
  if (workspaces.status === "loading" || (selectedWorkspaceId && overview.status === "loading" && !overview.data)) {
    return <PageLoading label={`Opening ${action.title}`} />
  }
  if (!selectedWorkspaceId) {
    return <ErrorState title="Choose a Workspace first" message="Create or select a Workspace before generating reusable Files." retry={() => window.location.assign("/origins/")} />
  }
  if (overview.status === "error" && !overview.data) {
    return <ErrorState title="Workspace unavailable" message={overview.error || "This Workspace could not be loaded."} retry={() => void refresh()} />
  }

  const Icon = action.icon
  const workspaceName = overview.data?.workspace.name || workspaces.data?.find((workspace) => workspace.id === selectedWorkspaceId)?.name || "Current Workspace"
  const libraryFiles = (overview.data?.files || []).map(editorFile)

  async function keepGeneratedFile(_folder: string, input: GeneratedKeepInput) {
    return originsApi.keepGeneratedAudioInWorkspace(input.candidateId, selectedWorkspaceId!, {
      name: input.name,
      category: input.category,
      tags: input.tags,
      folder_id: folderId,
    })
  }

  async function fileKept(_file: unknown, category: AudioFileCategory) {
    await refresh()
    toast.success(`${category === "music" ? "Music" : "Sound effect"} saved to Files.`, {
      description: `It is now reusable everywhere in ${workspaceName}.`,
    })
  }

  async function uploadReference(file: File) {
    const stored = await originsApi.uploadFileSummary(selectedWorkspaceId!, file, {
      name: file.name.replace(/\.[^.]+$/, ""),
      tags: ["reference"],
      folderId,
    })
    await refresh()
    return stored as WorkspaceFile
  }

  const audioCapability = action.capability === "music" || action.capability === "sfx" ? action.capability : null
  return <section className="create-creator-page">
    <header className="create-creator-header">
      <Button asChild variant="ghost" size="sm"><Link to="/origins/"><ArrowLeft />Create</Link></Button>
      <span className={`create-creator-icon is-${action.capability}`}><Icon /></span>
      <div><h1>{action.title}</h1><p>{action.description}</p></div>
      <span className="create-creator-destination"><small>Saving to</small><b>{workspaceName}</b></span>
    </header>
    <div className="create-creator-workspace">
      {action.capability === "speech" ? <Suspense fallback={<PageLoading label="Opening speech controls" />}><SpeechCreator embedded /></Suspense> : action.capability === "subtitle" ? <Suspense fallback={<PageLoading label="Opening subtitle controls" />}><SubtitleCreator embedded /></Suspense> : audioCapability ? <AudioCreator
        key={action.capability}
        mode="sound"
        workspaceId={selectedWorkspaceId}
        fixedCapability={audioCapability}
        allowPlacement={false}
        playingKey={player.source?.key}
        playerPlaying={player.state === "playing"}
        onPlay={(source) => void player.toggleSource(source)}
        onKeep={keepGeneratedFile}
        onKept={fileKept}
      /> : <MediaCreator
        key={action.capability}
        context={context!}
        uploading={false}
        uploadLabel=""
        libraryFiles={libraryFiles}
        onUploadReference={uploadReference}
        onGenerationOutputReady={refresh}
      />}
    </div>
  </section>
}
