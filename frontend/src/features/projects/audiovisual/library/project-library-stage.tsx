import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus } from "lucide-react"
import { toast } from "sonner"

import type { ConfirmAction } from "@/features/projects/audiovisual/support/project-overlays"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { WorkspaceFile } from "@/types/domain"
import { isVisualFile, visualFileAccept, visualFileIssue } from "./visual-files"
import { MediaCreator } from "@/features/creator/media/media-creator"
import { ProjectLibraryGallery } from "./project-library-gallery"
import { ProjectLibraryDialog } from "./project-library-dialog"
import { FilePreviewDialog } from "./file-preview-dialog"
import type { ProjectLibraryUploadItem } from "./project-library-upload-card"
import "./project-library-stage.css"

export function ProjectLibraryStage({ centerPaneRef, projectId, workspaceId, createOpen, onCreateOpenChange, files, libraryFileIds, usageCounts, playingFileId, onPlayAudio, onUpload, onRefresh, onAddToTimeline, onConfirmAction }: {
  centerPaneRef?: RefObject<HTMLElement | null>
  projectId: number
  workspaceId: number
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  files: WorkspaceFile[]
  libraryFileIds: number[]
  usageCounts?: ReadonlyMap<number, number>
  playingFileId?: number | null
  onPlayAudio?: (file: WorkspaceFile) => void
  onUpload: (file: File) => Promise<WorkspaceFile>
  onRefresh: () => Promise<void>
  onAddToTimeline?: (file: WorkspaceFile) => Promise<void>
  onConfirmAction?: (action: ConfirmAction) => void
}) {
  const [internalCreatorOpen, setInternalCreatorOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [uploads, setUploads] = useState<ProjectLibraryUploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const uploadChain = useRef(Promise.resolve())
  const uploadsRef = useRef<ProjectLibraryUploadItem[]>([])
  const dragDepth = useRef(0)
  const selectedIds = useMemo(() => new Set(libraryFileIds), [libraryFileIds])
  const creatorContext = useMemo<CreatorContext>(() => ({
    workspace_id: workspaceId,
    project_id: projectId,
    project_type: "audiovisual",
  }), [projectId, workspaceId])
  const visualFiles = useMemo(() => files.filter(isVisualFile), [files])
  const collected = useMemo(() => {
    const byId = new Map(files.map((file) => [file.id, file]))
    return [...libraryFileIds].reverse().flatMap((id) => {
      const file = byId.get(id)
      return file ? [file] : []
    })
  }, [files, libraryFileIds])
  const available = useMemo(() => visualFiles.filter((file) => !selectedIds.has(file.id)), [selectedIds, visualFiles])

  async function attach(file: WorkspaceFile) {
    setPendingId(file.id)
    setError("")
    try {
      await originsApi.attachProjectLibraryFile(projectId, file.id)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual could not be added to this Project.")
    } finally {
      setPendingId(null)
    }
  }

  async function remove(file: WorkspaceFile) {
    setPendingId(file.id)
    setError("")
    try {
      await originsApi.detachProjectLibraryFile(projectId, file.id)
      await onRefresh()
      toast.success(`${file.name || file.title || "File"} removed from the Project Library`, { description: "The File remains available in the Workspace Library." })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The File could not be removed from the Project Library."
      setError(message)
      toast.error("The File remains in the Project Library.", { description: message })
      throw reason
    } finally {
      setPendingId(null)
    }
  }

  function updateUpload(id: string, changes: Partial<ProjectLibraryUploadItem>) {
    setUploads((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function releaseUpload(item: ProjectLibraryUploadItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setUploads((current) => current.filter(({ id }) => id !== item.id))
  }

  async function processUpload(item: ProjectLibraryUploadItem) {
    setError("")
    try {
      updateUpload(item.id, { status: item.fileId ? "attaching" : "uploading", error: undefined })
      const file = item.fileId ? null : await onUpload(item.file)
      const fileId = item.fileId || file?.id
      if (!fileId) throw new Error("The uploaded visual did not return a usable media ID.")
      updateUpload(item.id, { status: "attaching", fileId })
      await originsApi.attachProjectLibraryFile(projectId, fileId)
      await onRefresh()
      releaseUpload(item)
    } catch (reason) {
      updateUpload(item.id, { status: "failed", error: reason instanceof Error ? reason.message : "The visual upload did not finish." })
    }
  }

  async function uploadReference(sourceFile: File) {
    const storedFile = await onUpload(sourceFile)
    if (isVisualFile(storedFile)) await originsApi.attachProjectLibraryFile(projectId, storedFile.id)
    await onRefresh()
    return storedFile
  }

  function queueUpload(item: ProjectLibraryUploadItem) {
    uploadChain.current = uploadChain.current.then(() => processUpload(item))
  }

  function upload(files: File[]) {
    if (!files.length) return
    const evaluated = files.map((file) => ({ file, issue: visualFileIssue(file) }))
    const issues = evaluated.flatMap(({ issue }) => issue ? [issue] : [])
    const accepted = evaluated.filter(({ issue }) => !issue).map(({ file }) => file)
    setError(issues.join(" "))
    if (!accepted.length) return
    const items = accepted.map((file, index): ProjectLibraryUploadItem => ({
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `project-library-upload-${Date.now()}-${index}`,
      file,
      previewUrl: (file.type.startsWith("image/") || file.type.startsWith("video/")) && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
      status: "queued",
    }))
    setUploads((current) => [...items, ...current])
    items.forEach(queueUpload)
  }

  function retryUpload(item: ProjectLibraryUploadItem) {
    updateUpload(item.id, { status: "queued", error: undefined })
    queueUpload({ ...item, status: "queued", error: undefined })
  }

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (!event.clipboardData?.files.length) return
      const files = Array.from(event.clipboardData.files)
      if (!files.length) return
      event.preventDefault()
      void upload(files)
    }
    window.addEventListener("paste", paste)
    return () => window.removeEventListener("paste", paste)
  }, [])

  useEffect(() => { uploadsRef.current = uploads }, [uploads])
  useEffect(() => () => uploadsRef.current.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) }), [])

  const activeUploads = uploads.filter((item) => item.status !== "failed")
  const uploadLabel = activeUploads.length === 1 ? "Uploading visual…" : `Uploading ${activeUploads.length} visuals…`
  return <main
    className="project-library-stage"
    ref={centerPaneRef}
    onDragEnter={(event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }}
    onDragOver={(event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    }}
    onDragLeave={(event) => {
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }}
    onDrop={(event) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      upload(Array.from(event.dataTransfer.files))
    }}
  >
    {dragging && <div className="project-library-drop-overlay" aria-hidden="true"><ImagePlus /><strong>Drop media into the Project Library</strong><span>It becomes a reusable Workspace File and is collected in this Project.</span></div>}
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} onChange={(event) => {
      if (event.target.files) void upload(Array.from(event.target.files))
      event.target.value = ""
    }} />
    <MediaCreator
      context={creatorContext} createOpen={createOpen ?? internalCreatorOpen} onCreateOpenChange={onCreateOpenChange ?? setInternalCreatorOpen} uploading={Boolean(activeUploads.length)} uploadLabel={uploadLabel}
      libraryFiles={files} recentFileIds={[...libraryFileIds].reverse()} usageCounts={usageCounts} onUploadReference={uploadReference}
      onGenerationOutputReady={onRefresh} onPreviewGenerated={setPreviewFile}
      onAddGeneratedToTimeline={onAddToTimeline}
      renderLibrary={(generatedOutputIds, generationItems) => <>
        {error && <div className="project-library-error" role="alert"><b>Library could not finish that action.</b><span>{error}</span></div>}
        <ProjectLibraryGallery files={collected.filter(({ id }) => !generatedOutputIds.has(id))} uploads={uploads} creationItems={generationItems} usageCounts={usageCounts} pendingId={pendingId} playingFileId={playingFileId} onPlayAudio={onPlayAudio} onPreview={setPreviewFile} onAddToTimeline={onAddToTimeline ? (file) => {
          setPendingId(file.id)
          void onAddToTimeline(file).catch((reason) => setError(reason instanceof Error ? reason.message : "The media could not be added to Timeline.")).finally(() => setPendingId(null))
        } : undefined} onRemove={(file) => {
          const name = file.name || file.title || file.filename || "this visual"
          if (!onConfirmAction) return
          onConfirmAction({
            title: `Remove “${name}” from the Project Library?`,
            description: "This removes the File from this Project Library. It remains reusable in the Workspace Library, and Timeline placements are not changed.",
            confirmLabel: "Remove from Project", variant: "default", action: () => remove(file),
          })
        }} onRetryUpload={retryUpload} onDismissUpload={releaseUpload} onUpload={() => inputRef.current?.click()} onOpenLibrary={() => setLibraryOpen(true)} />
      </>}
    />
    <ProjectLibraryDialog open={libraryOpen} files={available} usedFileIds={[...(usageCounts?.keys() || [])]} pendingId={pendingId} defaultSource="all" showProjectSource={false} onOpenChange={setLibraryOpen} onPreview={setPreviewFile} onAdd={(file) => void attach(file)} />
    <FilePreviewDialog file={previewFile} pending={Boolean(previewFile && pendingId === previewFile.id)} onAddToTimeline={onAddToTimeline ? (file) => {
      setPendingId(file.id)
      void onAddToTimeline(file).then(() => setPreviewFile(null)).catch((reason) => setError(reason instanceof Error ? reason.message : "The visual could not be added to Timeline.")).finally(() => setPendingId(null))
    } : undefined} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
  </main>
}
