import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { studioApi } from "@/lib/api"
import type { VentureAsset } from "@/types/domain"
import { acceptedVisualFiles, isVisualAsset, visualFileAccept } from "./director-assets"
import { DirectorComposer } from "./director-composer"
import { DirectorLibraryDialog } from "./director-library-dialog"
import { DirectorMasonry } from "./director-masonry"
import { DirectorPreviewDialog } from "./director-preview-dialog"
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState("")
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual could not be removed from this Production.")
    } finally {
      setPendingId(null)
    }
  }

  async function upload(files: File[]) {
    if (!files.length || uploadProgress) return
    setError("")
    setUploadProgress({ current: 1, total: files.length })
    let attachedAny = false
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length })
        const asset = await onUpload(file)
        await studioApi.attachDirectorAsset(productionId, asset.id)
        attachedAny = true
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The visual upload did not finish.")
    } finally {
      if (attachedAny) {
        await onRefresh().catch((reason) => {
          setError(reason instanceof Error ? reason.message : "The new visual is saved, but Director could not refresh it yet.")
        })
      }
      setUploadProgress(null)
    }
  }

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (uploadProgress || !event.clipboardData?.files.length) return
      const files = acceptedVisualFiles(event.clipboardData.files)
      if (!files.length) return
      event.preventDefault()
      void upload(files)
    }
    window.addEventListener("paste", paste)
    return () => window.removeEventListener("paste", paste)
  }, [uploadProgress])

  const uploadLabel = uploadProgress
    ? uploadProgress.total === 1 ? "Uploading visual…" : `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
    : "Uploading visuals…"
  return <main className="ws-center-pane director-stage" ref={centerPaneRef}>
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} onChange={(event) => {
      if (event.target.files) void upload(acceptedVisualFiles(event.target.files))
      event.target.value = ""
    }} />
    <DirectorComposer uploading={Boolean(uploadProgress)} uploadLabel={uploadLabel} onFiles={(files) => void upload(files)} onOpenLibrary={() => setLibraryOpen(true)} />
    {error && <div className="director-error" role="alert"><b>Director could not finish that action.</b><span>{error}</span></div>}
    <DirectorMasonry assets={collected} pendingId={pendingId} onPreview={setPreviewAsset} onRemove={(asset) => void remove(asset)} onUpload={() => inputRef.current?.click()} onOpenLibrary={() => setLibraryOpen(true)} />
    <DirectorLibraryDialog open={libraryOpen} assets={available} pendingId={pendingId} onOpenChange={setLibraryOpen} onPreview={setPreviewAsset} onAdd={(asset) => void attach(asset)} />
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </main>
}
