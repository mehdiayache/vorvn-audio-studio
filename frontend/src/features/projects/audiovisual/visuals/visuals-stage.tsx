import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus } from "lucide-react"
import { toast } from "sonner"

import type { ConfirmAction } from "@/features/projects/audiovisual/support/project-overlays"
import { originsApi, type ComposerContext } from "@/lib/api"
import type { WorkspaceFile } from "@/types/domain"
import { isVisualFile, visualFileAccept, visualFileIssue } from "./visuals-files"
import { MediaComposer } from "@/features/composer/media/media-composer"
import { VisualsGallery } from "./visuals-gallery"
import { VisualsLibraryDialog } from "./visuals-library-dialog"
import { VisualsPreviewDialog } from "./visuals-preview-dialog"
import type { VisualsUploadItem } from "./visuals-upload-card"
import "./visuals-stage.css"

export function VisualsStage({ centerPaneRef, projectId, workspaceId, createOpen = true, onCreateOpenChange = () => undefined, files, visualFileIds, usageCounts, onUpload, onRefresh, onAddToTimeline, onConfirmAction }: {
  centerPaneRef?: RefObject<HTMLElement | null>
  projectId: number
  workspaceId: number
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  files: WorkspaceFile[]
  visualFileIds: number[]
  usageCounts?: ReadonlyMap<number, number>
  onUpload: (file: File) => Promise<WorkspaceFile>
  onRefresh: () => Promise<void>
  onAddToTimeline?: (file: WorkspaceFile) => Promise<void>
  onConfirmAction?: (action: ConfirmAction) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [uploads, setUploads] = useState<VisualsUploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const uploadChain = useRef(Promise.resolve())
  const uploadsRef = useRef<VisualsUploadItem[]>([])
  const dragDepth = useRef(0)
  const selectedIds = useMemo(() => new Set(visualFileIds), [visualFileIds])
  const composerContext = useMemo<ComposerContext>(() => ({
    workspace_id: workspaceId,
    project_id: projectId,
    project_type: "audiovisual",
  }), [projectId, workspaceId])
  const visualFiles = useMemo(() => files.filter(isVisualFile), [files])
  const collected = useMemo(() => {
    const byId = new Map(visualFiles.map((file) => [file.id, file]))
    return [...visualFileIds].reverse().flatMap((id) => {
      const file = byId.get(id)
      return file ? [file] : []
    })
  }, [visualFileIds, visualFiles])
  const available = useMemo(() => visualFiles.filter((file) => !selectedIds.has(file.id)), [selectedIds, visualFiles])

  async function attach(file: WorkspaceFile) {
    setPendingId(file.id)
    setError("")
    try {
      await originsApi.attachVisualFile(projectId, file.id)
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
      await originsApi.detachVisualFile(projectId, file.id)
      await onRefresh()
      toast.success(`${file.name || file.title || "Visual"} removed from Visuals`, { description: "Its reusable File remains available in the File Library." })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The visual could not be removed from Visuals."
      setError(message)
      toast.error("The visual remains in Visuals.", { description: message })
      throw reason
    } finally {
      setPendingId(null)
    }
  }

  function updateUpload(id: string, changes: Partial<VisualsUploadItem>) {
    setUploads((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function releaseUpload(item: VisualsUploadItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setUploads((current) => current.filter(({ id }) => id !== item.id))
  }

  async function processUpload(item: VisualsUploadItem) {
    setError("")
    try {
      updateUpload(item.id, { status: item.fileId ? "attaching" : "uploading", error: undefined })
      const file = item.fileId ? null : await onUpload(item.file)
      const fileId = item.fileId || file?.id
      if (!fileId) throw new Error("The uploaded visual did not return a usable media ID.")
      updateUpload(item.id, { status: "attaching", fileId })
      await originsApi.attachVisualFile(projectId, fileId)
      await onRefresh()
      releaseUpload(item)
    } catch (reason) {
      updateUpload(item.id, { status: "failed", error: reason instanceof Error ? reason.message : "The visual upload did not finish." })
    }
  }

  async function uploadReference(sourceFile: File) {
    const storedFile = await onUpload(sourceFile)
    if (isVisualFile(storedFile)) await originsApi.attachVisualFile(projectId, storedFile.id)
    await onRefresh()
    return storedFile
  }

  function queueUpload(item: VisualsUploadItem) {
    uploadChain.current = uploadChain.current.then(() => processUpload(item))
  }

  function upload(files: File[]) {
    if (!files.length) return
    const evaluated = files.map((file) => ({ file, issue: visualFileIssue(file) }))
    const issues = evaluated.flatMap(({ issue }) => issue ? [issue] : [])
    const accepted = evaluated.filter(({ issue }) => !issue).map(({ file }) => file)
    setError(issues.join(" "))
    if (!accepted.length) return
    const items = accepted.map((file, index): VisualsUploadItem => ({
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `visuals-upload-${Date.now()}-${index}`,
      file,
      previewUrl: (file.type.startsWith("image/") || file.type.startsWith("video/")) && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
      status: "queued",
    }))
    setUploads((current) => [...items, ...current])
    items.forEach(queueUpload)
  }

  function retryUpload(item: VisualsUploadItem) {
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
    className="visuals-stage"
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
    {dragging && <div className="visuals-drop-overlay" aria-hidden="true"><ImagePlus /><strong>Drop visuals into Visuals</strong><span>They become reusable Workspace Files and are collected in Visuals.</span></div>}
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} onChange={(event) => {
      if (event.target.files) void upload(Array.from(event.target.files))
      event.target.value = ""
    }} />
    <MediaComposer
      context={composerContext} createOpen={createOpen} onCreateOpenChange={onCreateOpenChange} uploading={Boolean(activeUploads.length)} uploadLabel={uploadLabel}
      libraryFiles={files} recentFileIds={[...visualFileIds].reverse()} usageCounts={usageCounts} onUploadReference={uploadReference}
      onGenerationOutputReady={onRefresh} onPreviewGenerated={setPreviewFile}
      onAddGeneratedToTimeline={onAddToTimeline}
      renderCreations={(generatedOutputIds, generationItems) => <>
        {error && <div className="visuals-error" role="alert"><b>Visuals could not finish that action.</b><span>{error}</span></div>}
        <VisualsGallery files={collected.filter(({ id }) => !generatedOutputIds.has(id))} uploads={uploads} creationItems={generationItems} usageCounts={usageCounts} pendingId={pendingId} onPreview={setPreviewFile} onAddToTimeline={onAddToTimeline ? (file) => {
          setPendingId(file.id)
          void onAddToTimeline(file).catch((reason) => setError(reason instanceof Error ? reason.message : "The media could not be added to Timeline.")).finally(() => setPendingId(null))
        } : undefined} onRemove={(file) => {
          const name = file.name || file.title || file.filename || "this visual"
          if (!onConfirmAction) return
          onConfirmAction({
            title: `Remove “${name}” from Visuals?`,
            description: "This removes the visual from this Project’s Visuals workspace. Its reusable File remains available in the File Library. Timeline placements are not changed.",
            confirmLabel: "Remove from Visuals", variant: "default", action: () => remove(file),
          })
        }} onRetryUpload={retryUpload} onDismissUpload={releaseUpload} onUpload={() => inputRef.current?.click()} onOpenLibrary={() => setLibraryOpen(true)} />
      </>}
    />
    <VisualsLibraryDialog open={libraryOpen} files={available} usedFileIds={[...(usageCounts?.keys() || [])]} pendingId={pendingId} defaultSource="all" showProjectSource={false} onOpenChange={setLibraryOpen} onPreview={setPreviewFile} onAdd={(file) => void attach(file)} />
    <VisualsPreviewDialog file={previewFile} pending={Boolean(previewFile && pendingId === previewFile.id)} onAddToTimeline={onAddToTimeline ? (file) => {
      setPendingId(file.id)
      void onAddToTimeline(file).then(() => setPreviewFile(null)).catch((reason) => setError(reason instanceof Error ? reason.message : "The visual could not be added to Timeline.")).finally(() => setPendingId(null))
    } : undefined} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
  </main>
}
