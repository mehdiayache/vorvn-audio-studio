import { ArrowLeft, Captions, Mic2, Music2, WandSparkles, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { lazy, Suspense, useMemo, useRef, useState } from "react"
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { AudioCreator } from "@/features/creator/audio/audio-creator"
import { CreatorLibraryBrowser, type CreatorLibraryKind } from "@/features/creator/library/creator-library-browser"
import { CreatorLibraryWorkspace } from "@/features/creator/library/creator-library-workspace"
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
    title: "Create speech",
    description: "Create reusable speech audio with the voice, language and performance controls it needs.",
  },
  "generate-music": {
    capability: "music",
    icon: Music2,
    title: "Create music",
    description: "Create a reusable music File in this Workspace.",
  },
  "generate-sound-effect": {
    capability: "sfx",
    icon: Waves,
    title: "Create a sound effect",
    description: "Create Foley, ambience, impacts or transitions.",
  },
  "generate-media": {
    capability: "media",
    icon: WandSparkles,
    title: "Create media",
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
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
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
  const isTool = action.capability === "subtitle"
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

  async function uploadLibraryFile(file: File) {
    setUploadingFile(true)
    try {
      await originsApi.uploadFileSummary(selectedWorkspaceId!, file, {
        name: file.name.replace(/\.[^.]+$/, ""),
        tags: [],
        folderId,
      })
      await refresh()
      toast.success(`${file.name} added to Library.`)
    } catch (reason) {
      toast.error("The File could not be uploaded.", { description: reason instanceof Error ? reason.message : undefined })
    } finally { setUploadingFile(false) }
  }

  const audioCapability = action.capability === "music" || action.capability === "sfx" ? action.capability : null
  return <section className="create-creator-page">
    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" disabled={uploadingFile} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLibraryFile(file); event.target.value = "" }} />
    <header className="create-creator-header">
      <Button asChild variant="ghost" size="sm"><Link to="/origins/"><ArrowLeft />Create</Link></Button>
      <span className={`create-creator-icon is-${action.capability}`}><Icon /></span>
      <div><h1>{isTool ? "Subtitles Tool" : "Creator Library"}</h1><p>{action.title} · {action.description}</p></div>
      <span className="create-creator-destination"><small>Saving to</small><b>{workspaceName}</b></span>
    </header>
    <div className="create-creator-workspace">
      {action.capability === "media" ? <MediaCreator
        key={action.capability}
        context={context!}
        uploading={false}
        uploadLabel=""
        libraryFiles={libraryFiles}
        onUploadReference={uploadReference}
        onGenerationOutputReady={refresh}
        renderLibrary={() => <CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind="all" playingKey={player.source?.key} playerPlaying={player.state === "playing"} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
      /> : <CreatorLibraryWorkspace
        primaryLabel={isTool ? "Tool" : "Creator"}
        primaryAriaLabel={isTool ? "Subtitle tool" : "Creator"}
        workspaceLabel={isTool ? "Subtitle Tool and Library" : "Creator Library"}
        creatorDetail={action.title}
        libraryDetail={`${libraryFiles.length} reusable File${libraryFiles.length === 1 ? "" : "s"} · ${workspaceName}`}
        creator={action.capability === "speech" ? <Suspense fallback={<PageLoading label="Opening speech controls" />}><SpeechCreator embedded panelOnly onLibraryChange={refresh} /></Suspense> : action.capability === "subtitle" ? <Suspense fallback={<PageLoading label="Opening subtitle controls" />}><SubtitleCreator embedded panelOnly onLibraryChange={refresh} /></Suspense> : <AudioCreator
        key={action.capability}
        mode="sound"
        workspaceId={selectedWorkspaceId}
        fixedCapability={audioCapability!}
        allowPlacement={false}
        playingKey={player.source?.key}
        playerPlaying={player.state === "playing"}
        onPlay={(source) => void player.toggleSource(source)}
        onKeep={keepGeneratedFile}
        onKept={fileKept}
      />}
        library={<CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind={action.capability as CreatorLibraryKind} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
      />}
    </div>
  </section>
}
