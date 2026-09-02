import { ArrowLeft, Image, Music2, Video, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useMemo } from "react"
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { AudioComposer } from "@/features/composer/audio/audio-composer"
import { MediaComposer } from "@/features/composer/media/media-composer"
import type { GeneratedKeepInput } from "@/features/workspace/library/audio-library"
import "@/features/workspace/library/audio-library.css"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi, type ComposerContext } from "@/lib/api"
import type { AudioFileCategory, WorkspaceFile, WorkspaceFileSummary } from "@/types/domain"

import "./create-composer-page.css"

type CreateComposerAction = {
  capability: "music" | "sfx" | "image" | "video"
  icon: LucideIcon
  title: string
  description: string
}

const composerActions: Record<string, CreateComposerAction> = {
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
  "generate-image": {
    capability: "image",
    icon: Image,
    title: "Generate an image",
    description: "Use any available image-capable model and keep the result as a reusable File.",
  },
  "generate-video": {
    capability: "video",
    icon: Video,
    title: "Generate a video",
    description: "Use any available video-capable model with the inputs and controls it supports.",
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

export function CreateComposerPage() {
  const { actionId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const action = composerActions[actionId]
  const { workspaces, overview, selectedWorkspaceId, refresh } = useWorkspaceExplorer()
  const player = useGlobalPlayer()
  const folderId = Number(searchParams.get("folder_id") || 0) || null
  const context = useMemo<ComposerContext | null>(() => selectedWorkspaceId ? ({
    workspace_id: selectedWorkspaceId,
    folder_id: folderId,
    selection: action?.capability === "image" || action?.capability === "video"
      ? { output_media_type: action.capability }
      : action ? { capability: action.capability } : {},
  }) : null, [action, folderId, selectedWorkspaceId])

  if (actionId === "generate-speech") return <Navigate replace to="/origins/speak" />
  if (actionId === "create-subtitles") return <Navigate replace to="/origins/subtitles" />
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
  return <section className="create-composer-page">
    <header className="create-composer-header">
      <Button asChild variant="ghost" size="sm"><Link to="/origins/"><ArrowLeft />Create</Link></Button>
      <span className={`create-composer-icon is-${action.capability}`}><Icon /></span>
      <div><h1>{action.title}</h1><p>{action.description}</p></div>
      <span className="create-composer-destination"><small>Saving to</small><b>{workspaceName}</b></span>
    </header>
    <div className="create-composer-workspace">
      {audioCapability ? <AudioComposer
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
      /> : <MediaComposer
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
