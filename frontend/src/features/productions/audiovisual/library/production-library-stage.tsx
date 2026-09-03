import type { ComponentPropsWithoutRef, RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { CreatorCapabilityDispatcher } from "@/features/creator/creator-capability-dispatcher"
import { CreatorHost } from "@/features/creator/creator-host"
import type { CreatorResult } from "@/features/creator/creator-contracts"
import type { ConfirmAction } from "@/features/productions/audiovisual/support/production-overlays"
import { originsApi, type CreatorContext } from "@/lib/api"
import type { WorkspaceFile, WorkspaceFolder } from "@/types/domain"
import { isVisualFile } from "@/features/files/file-presentation"
import { ProductionLibraryGallery } from "./production-library-gallery"
import { FilePreviewDialog } from "@/features/files/file-preview-dialog"
import type { ProductionLibraryUploadItem } from "./production-library-upload-card"
import "./production-library-stage.css"

const productionFileAccept = "audio/*,image/*,video/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip"
const productionFileExtensions = /\.(?:mp3|wav|m4a|aac|ogg|flac|aif|aiff|jpe?g|png|webp|mp4|mov|webm|srt|vtt|txt|md|pdf|json|csv|zip)$/i

function productionFileIssue(file: File) {
  if (!productionFileExtensions.test(file.name)) return `${file.name} is not a supported Workspace File.`
  if (file.size > 1_000_000_000) return `${file.name} is over the 1 GB File limit.`
  return null
}
export function ProductionLibraryStage({ centerPaneRef, productionId, workspaceId, folderId, createOpen, onCreateOpenChange, folders = [], files, productionFileIds = [], libraryFileIds, usageCounts, playingFileId, onPlayAudio, onUpload, onRefresh, onAddToTimeline, onConfirmAction }: {
  centerPaneRef?: RefObject<HTMLElement | null>
  productionId: number
  workspaceId: number
  folderId?: number | null
  folders?: WorkspaceFolder[]
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
  files: WorkspaceFile[]
  productionFileIds?: number[]
  libraryFileIds: number[]
  usageCounts?: ReadonlyMap<number, number>
  playingFileId?: number | null
  onPlayAudio?: (file: WorkspaceFile) => void
  onUpload: (file: File) => Promise<WorkspaceFile>
  onRefresh: () => Promise<void>
  onAddToTimeline?: (file: WorkspaceFile) => Promise<void>
  onConfirmAction?: (action: ConfirmAction) => void
}) {
  const player = useGlobalPlayer()
  const [internalCreatorOpen, setInternalCreatorOpen] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [uploads, setUploads] = useState<ProductionLibraryUploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const uploadChain = useRef(Promise.resolve())
  const uploadsRef = useRef<ProductionLibraryUploadItem[]>([])
  const dragDepth = useRef(0)
  const selectedIds = useMemo(() => new Set(libraryFileIds), [libraryFileIds])
  const creatorContext = useMemo<CreatorContext>(() => ({
    workspace_id: workspaceId,
    folder_id: folderId ?? null,
    production_id: productionId,
    production_type: "audiovisual",
  }), [folderId, productionId, workspaceId])
  const panelOpen = createOpen ?? internalCreatorOpen
  const setPanelOpen = onCreateOpenChange ?? setInternalCreatorOpen

  async function attach(file: WorkspaceFile) {
    setPendingId(file.id)
    setError("")
    try {
      await originsApi.attachProductionLibraryFile(productionId, file.id)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The File could not be added to this Production.")
    } finally {
      setPendingId(null)
    }
  }

  async function remove(file: WorkspaceFile) {
    setPendingId(file.id)
    setError("")
    try {
      await originsApi.detachProductionLibraryFile(productionId, file.id)
      await onRefresh()
      toast.success(`${file.name || file.title || "File"} removed from the Production Library`, { description: "The File remains available in the Workspace Library." })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The File could not be removed from the Production Library."
      setError(message)
      toast.error("The File remains in the Production Library.", { description: message })
      throw reason
    } finally {
      setPendingId(null)
    }
  }

  async function attachCreatorResult(result: CreatorResult) {
    for (const fileId of [...new Set(result.file_ids)]) {
      if (!selectedIds.has(fileId)) await originsApi.attachProductionLibraryFile(productionId, fileId)
    }
    await onRefresh()
  }

  function updateUpload(id: string, changes: Partial<ProductionLibraryUploadItem>) {
    setUploads((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function releaseUpload(item: ProductionLibraryUploadItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setUploads((current) => current.filter(({ id }) => id !== item.id))
  }

  async function processUpload(item: ProductionLibraryUploadItem) {
    setError("")
    try {
      updateUpload(item.id, { status: item.fileId ? "attaching" : "uploading", error: undefined })
      const file = item.fileId ? null : await onUpload(item.file)
      const fileId = item.fileId || file?.id
      if (!fileId) throw new Error("The uploaded File did not return a usable ID.")
      updateUpload(item.id, { status: "attaching", fileId })
      await originsApi.attachProductionLibraryFile(productionId, fileId)
      await onRefresh()
      releaseUpload(item)
    } catch (reason) {
      updateUpload(item.id, { status: "failed", error: reason instanceof Error ? reason.message : "The File upload did not finish." })
    }
  }

  async function uploadReference(sourceFile: File) {
    const storedFile = await onUpload(sourceFile)
    if (isVisualFile(storedFile)) await originsApi.attachProductionLibraryFile(productionId, storedFile.id)
    await onRefresh()
    return storedFile
  }

  function queueUpload(item: ProductionLibraryUploadItem) {
    uploadChain.current = uploadChain.current.then(() => processUpload(item))
  }

  function upload(files: File[]) {
    if (!files.length) return
    const evaluated = files.map((file) => ({ file, issue: productionFileIssue(file) }))
    const issues = evaluated.flatMap(({ issue }) => issue ? [issue] : [])
    const accepted = evaluated.filter(({ issue }) => !issue).map(({ file }) => file)
    setError(issues.join(" "))
    if (!accepted.length) return
    const items = accepted.map((file, index): ProductionLibraryUploadItem => ({
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `production-library-upload-${Date.now()}-${index}`,
      file,
      previewUrl: (file.type.startsWith("image/") || file.type.startsWith("video/")) && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
      status: "queued",
    }))
    setUploads((current) => [...items, ...current])
    items.forEach(queueUpload)
  }

  function retryUpload(item: ProductionLibraryUploadItem) {
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
  const uploadLabel = activeUploads.length === 1 ? "Uploading File…" : `Uploading ${activeUploads.length} Files…`
  const productionLibrary = (generatedOutputIds: Set<number> = new Set(), generationItems: Parameters<typeof ProductionLibraryGallery>[0]["creationItems"] = []) => <>
    {dragging && <div className="production-library-drop-overlay" aria-hidden="true"><ImagePlus /><strong>Drop Files into the Production Library</strong><span>They become reusable Workspace Files and are collected in this Production.</span></div>}
    <input ref={inputRef} hidden multiple type="file" accept={productionFileAccept} onChange={(event) => {
      if (event.target.files) void upload(Array.from(event.target.files))
      event.target.value = ""
    }} />
    {error && <div className="production-library-error" role="alert"><b>Library could not finish that action.</b><span>{error}</span></div>}
    <ProductionLibraryGallery folders={folders} files={files.filter(({ id }) => !generatedOutputIds.has(id))} productionFileIds={productionFileIds} libraryFileIds={libraryFileIds} currentFolderId={folderId} uploads={uploads} creationItems={generationItems} usageCounts={usageCounts} pendingId={pendingId} playingFileId={playingFileId} onPlayAudio={onPlayAudio} onPreview={setPreviewFile} onAddToProduction={(file) => void attach(file)} onAddToTimeline={onAddToTimeline ? (file) => {
      setPendingId(file.id)
      void onAddToTimeline(file).catch((reason) => setError(reason instanceof Error ? reason.message : "The File could not be added to Timeline.")).finally(() => setPendingId(null))
    } : undefined} onRemove={(file) => {
      const name = file.name || file.title || file.filename || "this File"
      if (!onConfirmAction) return
      onConfirmAction({
        title: `Remove “${name}” from the Production Library?`,
        description: "This removes the File from this Production Library. It remains reusable in the Workspace Library, and Timeline placements are not changed.",
        confirmLabel: "Remove from Production", variant: "default", action: () => remove(file),
      })
    }} onRetryUpload={retryUpload} onDismissUpload={releaseUpload} onUpload={() => inputRef.current?.click()} />
  </>
  const libraryPaneProps: ComponentPropsWithoutRef<"main"> = {
    onDragEnter: (event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver: (event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    },
    onDragLeave: (event) => {
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop: (event) => {
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      upload(Array.from(event.dataTransfer.files))
    },
  }
  return <>
    <CreatorHost
      context={creatorContext}
      initialCapability="video"
      presentation="workstation"
      libraryPaneRef={centerPaneRef}
      libraryPaneProps={libraryPaneProps}
      creatorOpen={panelOpen}
      onCreatorOpenChange={setPanelOpen}
    >{(session) => <CreatorCapabilityDispatcher
        session={session}
        libraryDetail={`${productionFileIds.length} Production File${productionFileIds.length === 1 ? "" : "s"}`}
        mediaProps={{
          uploading: Boolean(activeUploads.length),
          uploadLabel,
          libraryFiles: files,
          recentFileIds: [...productionFileIds].reverse(),
          usageCounts,
          onUploadReference: uploadReference,
          onPreviewFile: setPreviewFile,
        }}
        audioProps={{
          playingKey: player.source?.key,
          playerPlaying: player.state === "playing",
          onPlay: (source) => void player.toggleSource(source),
        }}
        onResult={attachCreatorResult}
        resultAction={onAddToTimeline ? {
          label: "Add to Timeline",
          detail: "Place this File at the current playhead.",
          busyLabel: "Adding to Timeline…",
          run: async ({ file_ids }) => {
            const overview = await originsApi.workspace(workspaceId)
            const file = overview.files.find(({ id }) => id === file_ids[0])
            if (!file) throw new Error("The created File is not available yet.")
            await onAddToTimeline(file)
          },
        } : undefined}
        renderLibrary={({ generatedOutputIds, creationItems }) => productionLibrary(generatedOutputIds, creationItems)}
      />}</CreatorHost>
    <FilePreviewDialog file={previewFile} pending={Boolean(previewFile && pendingId === previewFile.id)} primaryLabel="Add to Timeline" onPrimaryAction={onAddToTimeline && previewFile && isVisualFile(previewFile) ? (file) => {
      setPendingId(file.id)
      void onAddToTimeline(file).then(() => setPreviewFile(null)).catch((reason) => setError(reason instanceof Error ? reason.message : "The File could not be added to Timeline.")).finally(() => setPendingId(null))
    } : undefined} onOpenChange={(open) => { if (!open) setPreviewFile(null) }} />
  </>
}
