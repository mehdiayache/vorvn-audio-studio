import { Captions, FileImage, FileVideo, Mic2, Music2, Waves } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CreatorCapabilityDispatcher } from "@/features/creator/creator-capability-dispatcher"
import { CreatorHost, type CreatorCapabilityId } from "@/features/creator/creator-host"
import { CreatorLibraryBrowser } from "@/features/creator/library/creator-library-browser"
import type { LibraryTypeFilter } from "@/features/library/library-query"
import { FilePreviewDialog } from "@/features/files/file-preview-dialog"
import { CreatorLibraryWorkspace } from "@/features/creator/library/creator-library-workspace"
import { WorkspaceExplorerPage } from "@/features/workspace/explorer/workspace-explorer-page"
import "@/features/workspace/library/audio-library.css"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { WorkspaceFile } from "@/types/domain"

import "./create-creator-page.css"

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

const creatorActionByCapability: Record<CreatorCapabilityId, string> = {
  image: "generate-image",
  video: "generate-video",
  speech: "generate-speech",
  music: "generate-music",
  sfx: "generate-sound-effect",
}

export function CreateCreatorPage() {
  const { actionId = "" } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const action = creatorActions[actionId]
  const { workspaces, overview, selectedWorkspaceId, refresh } = useWorkspaceExplorer()
  const player = useGlobalPlayer()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const creatorDialogRef = useRef<HTMLDivElement>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [activeCapability, setActiveCapability] = useState<CreatorCapabilityId | null>(
    action?.capability === "subtitle" ? null : action?.capability || null,
  )
  const folderId = Number(searchParams.get("folder_id") || 0) || null
  const context = useMemo<CreatorContext | null>(() => selectedWorkspaceId ? ({
    workspace_id: selectedWorkspaceId,
    folder_id: folderId,
    selection: action ? { capability: action.capability } : {},
  }) : null, [action, folderId, selectedWorkspaceId])

  useEffect(() => {
    setActiveCapability(action?.capability === "subtitle" ? null : action?.capability || null)
  }, [action])

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

  const creatorCapability = action.capability === "subtitle" ? null : action.capability
  const isTool = creatorCapability === null
  const visibleAction = activeCapability
    ? Object.values(creatorActions).find((candidate) => candidate.capability === activeCapability) || action
    : action
  const Icon = visibleAction.icon
  const workspaceName = overview.data?.workspace.name || workspaces.data?.find((workspace) => workspace.id === selectedWorkspaceId)?.name || "Current Workspace"
  const libraryFiles = overview.data?.files || []

  async function handleCreatorResult() {
    await refresh()
    toast.success("Creation saved to Files.", {
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
    <WorkspaceExplorerPage view="home" />
    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" disabled={uploadingFile} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLibraryFile(file); event.target.value = "" }} />
    <Dialog open onOpenChange={(open) => { if (!open) navigate("/origins/") }}>
      <DialogContent
        ref={creatorDialogRef}
        tabIndex={-1}
        className="create-creator-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          creatorDialogRef.current?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader className="create-creator-header">
          <span className={`create-creator-icon is-${visibleAction.capability}`}><Icon /></span>
          <span className="create-creator-heading"><DialogTitle>{visibleAction.title}</DialogTitle><DialogDescription className="sr-only">{visibleAction.description}</DialogDescription></span>
          <span className="create-creator-destination" title={workspaceName}><span>Saving to</span><b>{workspaceName}</b></span>
        </DialogHeader>
        <div className="create-creator-workspace">
      {isTool ? <CreatorLibraryWorkspace
        primaryLabel={isTool ? "Tool" : "Creator"}
        primaryAriaLabel={isTool ? "Subtitle tool" : "Creator"}
        workspaceLabel={isTool ? "Subtitle Tool and Library" : "Creator Library"}
        creatorDetail={action.title}
        libraryDetail={`${libraryFiles.length} reusable File${libraryFiles.length === 1 ? "" : "s"} · ${workspaceName}`}
        creator={<Suspense fallback={<PageLoading label="Opening subtitle controls" />}><SubtitleCreator embedded panelOnly onLibraryChange={refresh} /></Suspense>}
        library={<CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} initialKind={action.capability as LibraryTypeFilter} selectedFileId={previewFile?.id} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onSelect={setPreviewFile} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
      /> : <CreatorHost context={context!} initialCapability={creatorCapability} onCapabilityChange={(capability) => {
        setActiveCapability(capability)
        const query = searchParams.toString()
        navigate(`/origins/create/${creatorActionByCapability[capability]}${query ? `?${query}` : ""}`, { replace: true })
      }}>
        {(session) => <CreatorCapabilityDispatcher
          session={session}
          libraryDetail={`${libraryFiles.length} reusable File${libraryFiles.length === 1 ? "" : "s"} · ${workspaceName}`}
          mediaProps={{
            uploading: false,
            uploadLabel: "",
            libraryFiles,
            onUploadReference: uploadReference,
          }}
          audioProps={{
            playingKey: player.source?.key,
            playerPlaying: player.state === "playing",
            onPlay: (source) => void player.toggleSource(source),
          }}
          onResult={handleCreatorResult}
          renderLibrary={({ capability, creationItems }) => <CreatorLibraryBrowser files={libraryFiles} folders={overview.data?.folders || []} creationItems={creationItems} initialKind={capability} selectedFileId={previewFile?.id} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onSelect={setPreviewFile} onPlay={(source) => void player.toggleSource(source)} onUpload={() => uploadInputRef.current?.click()} />}
        />}
      </CreatorHost>}
        </div>
        <FilePreviewDialog file={previewFile} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
      </DialogContent>
    </Dialog>
  </>
}
