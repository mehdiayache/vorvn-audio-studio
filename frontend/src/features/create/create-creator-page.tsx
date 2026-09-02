import { Captions, FileImage, FileVideo, Mic2, Music2, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { lazy, Suspense, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AudioCreator } from "@/features/creator/audio/audio-creator"
import { CreatorHost, type CreatorCapabilityId } from "@/features/creator/creator-host"
import { CreatorLibraryBrowser, type CreatorLibraryKind } from "@/features/creator/library/creator-library-browser"
import { FilePreviewDialog } from "@/features/creator/library/file-preview-dialog"
import { CreatorLibraryWorkspace } from "@/features/creator/library/creator-library-workspace"
import { MediaCreator } from "@/features/creator/media/media-creator"
import { WorkspaceExplorerPage } from "@/features/workspace/explorer/workspace-explorer-page"
import type { GeneratedKeepInput } from "@/features/workspace/library/audio-library"
import "@/features/workspace/library/audio-library.css"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { AudioFileCategory, WorkspaceFile } from "@/types/domain"

import "./create-creator-page.css"

const SpeechCreator = lazy(() => import("@/features/creator/speech/speech-creator-page").then((module) => ({ default: module.SpeechCreatorPage })))
const SubtitleCreator = lazy(() => import("@/features/creator/subtitles/subtitle-creator-page").then((module) => ({ default: module.SubtitleCreatorPage })))

type CreateCreatorAction = {
  capability: CreatorCapabilityId | "subtitle"
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
  "generate-image": {
    capability: "image",
    icon: FileImage,
    title: "Create image",
    description: "Create a reusable image File in this Workspace.",
  },
  "generate-video": {
    capability: "video",
    icon: FileVideo,
    title: "Create video",
    description: "Create a reusable video File in this Workspace.",
  },
  "create-subtitles": {
    capability: "subtitle",
    icon: Captions,
    title: "Create subtitles",
    description: "Transcribe external audio into reusable subtitle Files.",
  },
}

export function CreateCreatorPage() {
  const { actionId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const action = creatorActions[actionId]
  const { workspaces, overview, selectedWorkspaceId, refresh } = useWorkspaceExplorer()
  const player = useGlobalPlayer()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const folderId = Number(searchParams.get("folder_id") || 0) || null
  const context = useMemo<CreatorContext | null>(() => selectedWorkspaceId ? ({
    workspace_id: selectedWorkspaceId,
    folder_id: folderId,
    selection: action ? { capability: action.capability } : {},
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
  const creatorCapability = action.capability === "subtitle" ? null : action.capability
  const isTool = creatorCapability === null
  const workspaceName = overview.data?.workspace.name || workspaces.data?.find((workspace) => workspace.id === selectedWorkspaceId)?.name || "Current Workspace"
  const libraryFiles = overview.data?.files || []

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

  return <>
    <WorkspaceExplorerPage view="create" />
    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" disabled={uploadingFile} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLibraryFile(file); event.target.value = "" }} />
    <Dialog open onOpenChange={(open) => { if (!open) navigate("/origins/") }}>
      <DialogContent className="create-creator-dialog">
        <DialogHeader className="create-creator-header">
          <span className={`create-creator-icon is-${action.capability}`}><Icon /></span>
          <span className="create-creator-heading"><DialogTitle>{action.title}</DialogTitle><DialogDescription>{action.description}</DialogDescription></span>
          <span className="create-creator-destination"><small>Saving to</small><b>{workspaceName}</b></span>
        </DialogHeader>
        <div className="create-creator-workspace">
      {isTool ? <CreatorLibraryWorkspace
        primaryLabel={isTool ? "Tool" : "Creator"}
        primaryAriaLabel={isTool ? "Subtitle tool" : "Creator"}
        workspaceLabel={isTool ? "Subtitle Tool and Library" : "Creator Library"}
        creatorDetail={action.title}
        libraryDetail={`${libraryFiles.length} reusable File${libraryFiles.length === 1 ? "" : "s"} · ${workspaceName}`}
        creator={<Suspense fallback={<PageLoading label="Opening subtitle controls" />}><SubtitleCreator embedded panelOnly onLibraryChange={refresh} /></Suspense>}
        library={<CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind={action.capability as CreatorLibraryKind} selectedFileId={previewFile?.id} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onSelect={setPreviewFile} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
      /> : <CreatorHost context={context!} initialCapability={creatorCapability}>
        {({ capability, context: activeContext, renderWorkspace }) => capability === "image" || capability === "video" ? <MediaCreator
          key={capability}
          context={activeContext}
          uploading={false}
          uploadLabel=""
          libraryFiles={libraryFiles}
          onUploadReference={uploadReference}
          onGenerationOutputReady={refresh}
          renderLibrary={() => <CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind={capability} selectedFileId={previewFile?.id} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onSelect={setPreviewFile} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
          renderWorkspace={renderWorkspace}
        /> : renderWorkspace({
          creatorDetail: capability === "speech" ? "Speech" : capability === "music" ? "Music" : "Sound effects",
          libraryDetail: `${libraryFiles.length} reusable File${libraryFiles.length === 1 ? "" : "s"} · ${workspaceName}`,
          creator: capability === "speech"
            ? <Suspense fallback={<PageLoading label="Opening speech controls" />}><SpeechCreator embedded panelOnly onLibraryChange={refresh} /></Suspense>
            : <AudioCreator
              key={capability}
              mode="sound"
              workspaceId={selectedWorkspaceId}
              fixedCapability={capability}
              allowPlacement={false}
              playingKey={player.source?.key}
              playerPlaying={player.state === "playing"}
              onPlay={(source) => void player.toggleSource(source)}
              onKeep={keepGeneratedFile}
              onKept={fileKept}
            />,
          library: <CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind={capability} selectedFileId={previewFile?.id} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onSelect={setPreviewFile} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />,
        })}
      </CreatorHost>}
        </div>
        <FilePreviewDialog file={previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
      </DialogContent>
    </Dialog>
  </>
}
