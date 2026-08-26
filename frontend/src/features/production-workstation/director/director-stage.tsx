import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ImagePlus } from "lucide-react"
import { toast } from "sonner"

import { studioApi } from "@/lib/api"
import type { VentureAsset } from "@/types/domain"
import { acceptedVisualFiles, isVisualAsset, visualFileAccept } from "./director-assets"
import { DirectorComposer } from "./director-composer"
import { DirectorLibraryDialog } from "./director-library-dialog"
import { DirectorMasonry } from "./director-masonry"
import { DirectorPreviewDialog } from "./director-preview-dialog"
import type { DirectorUploadItem } from "./director-upload-card"
import "./director-stage.css"

export function DirectorStage({ centerPaneRef, productionId, assets, directorAssetIds, onUpload, onRefresh }: {
  centerPaneRef?: RefObject<HTMLElement | null>
  productionId: number
  assets: VentureAsset[]
  directorAssetIds: number[]
  onUpload: (file: File) => Promise<VentureAsset>
  onRefresh: () => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<VentureAsset | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [uploads, setUploads] = useState<DirectorUploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const uploadChain = useRef(Promise.resolve())
  const uploadsRef = useRef<DirectorUploadItem[]>([])
  const dragDepth = useRef(0)
  const selectedIds = useMemo(() => new Set(directorAssetIds), [directorAssetIds])
  const visualAssets = useMemo(() => assets.filter(isVisualAsset), [assets])
  const collected = useMemo(() => visualAssets.filter((asset) => selectedIds.has(asset.id)), [selectedIds, visualAssets])
  const available = useMemo(() => visualAssets.filter((asset) => !selectedIds.has(asset.id)), [selectedIds, visualAssets])

  async function attach(asset: VentureAsset) {
    setPendingId(asset.id)
    setError("")
    try {
      await studioApi.attachDirectorAsset(productionId, asset.id)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual could not be added to this Production.")
    } finally {
      setPendingId(null)
    }
  }

  async function remove(asset: VentureAsset) {
    setPendingId(asset.id)
    setError("")
    try {
      await studioApi.detachDirectorAsset(productionId, asset.id)
      await onRefresh()
      toast.success(`${asset.name || asset.title || "Visual"} removed from Director`, { description: "It remains available in Visual Library." })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual could not be removed from Director.")
    } finally {
      setPendingId(null)
    }
  }

  function updateUpload(id: string, changes: Partial<DirectorUploadItem>) {
    setUploads((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function releaseUpload(item: DirectorUploadItem) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setUploads((current) => current.filter(({ id }) => id !== item.id))
  }

  async function processUpload(item: DirectorUploadItem) {
    setError("")
    try {
      updateUpload(item.id, { status: item.assetId ? "attaching" : "uploading", error: undefined })
      const asset = item.assetId ? null : await onUpload(item.file)
      const assetId = item.assetId || asset?.id
      if (!assetId) throw new Error("The uploaded visual did not return an Asset ID.")
      updateUpload(item.id, { status: "attaching", assetId })
      await studioApi.attachDirectorAsset(productionId, assetId)
      await onRefresh()
      releaseUpload(item)
    } catch (reason) {
      updateUpload(item.id, { status: "failed", error: reason instanceof Error ? reason.message : "The visual upload did not finish." })
    }
  }

  function queueUpload(item: DirectorUploadItem) {
    uploadChain.current = uploadChain.current.then(() => processUpload(item))
  }

  function upload(files: File[]) {
    if (!files.length) return
    const items = files.map((file, index): DirectorUploadItem => ({
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `director-upload-${Date.now()}-${index}`,
      file,
      previewUrl: (file.type.startsWith("image/") || file.type.startsWith("video/")) && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null,
      status: "queued",
    }))
    setUploads((current) => [...items, ...current])
    items.forEach(queueUpload)
  }

  function retryUpload(item: DirectorUploadItem) {
    updateUpload(item.id, { status: "queued", error: undefined })
    queueUpload({ ...item, status: "queued", error: undefined })
  }

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (!event.clipboardData?.files.length) return
      const files = acceptedVisualFiles(event.clipboardData.files)
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
    className="ws-center-pane director-stage"
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
      const accepted = acceptedVisualFiles(event.dataTransfer.files)
      if (accepted.length) upload(accepted)
      else setError("Drop a JPG, PNG, WebP, MP4, MOV or WebM file into Director.")
    }}
  >
    {dragging && <div className="director-drop-overlay" aria-hidden="true"><ImagePlus /><strong>Drop visuals into Director</strong><span>They will upload here and remain available in Visual Library.</span></div>}
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} onChange={(event) => {
      if (event.target.files) void upload(acceptedVisualFiles(event.target.files))
      event.target.value = ""
    }} />
    <DirectorComposer uploading={Boolean(activeUploads.length)} uploadLabel={uploadLabel} onFiles={upload} onOpenLibrary={() => setLibraryOpen(true)} />
    {error && <div className="director-error" role="alert"><b>Director could not finish that action.</b><span>{error}</span></div>}
    <DirectorMasonry assets={collected} uploads={uploads} pendingId={pendingId} onPreview={setPreviewAsset} onRemove={(asset) => void remove(asset)} onRetryUpload={retryUpload} onDismissUpload={releaseUpload} onUpload={() => inputRef.current?.click()} onOpenLibrary={() => setLibraryOpen(true)} />
    <DirectorLibraryDialog open={libraryOpen} assets={available} pendingId={pendingId} onOpenChange={setLibraryOpen} onPreview={setPreviewAsset} onAdd={(asset) => void attach(asset)} />
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </main>
}
