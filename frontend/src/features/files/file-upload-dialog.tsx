import { useState } from "react"
import { Upload } from "lucide-react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAsyncAction } from "@/hooks/use-async-action"
import { originsApi } from "@/lib/api"

import "./file-upload-dialog.css"

export function FileUploadDialog({ open, onOpenChange, workspaceId, folderId, locationLabel, onUploaded }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: number
  folderId: number | null
  locationLabel?: string
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [tagText, setTagText] = useState("")
  const [error, setError] = useState("")
  const action = useAsyncAction<"upload">()
  const uploading = action.isPending("upload")

  function reset() {
    setFile(null)
    setName("")
    setTagText("")
    setError("")
  }

  async function upload() {
    if (!file || !name.trim()) return
    await action.run("upload", async () => {
      try {
        const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean)
        await originsApi.uploadFileSummary(workspaceId, file, { name: name.trim(), tags, folderId })
        toast.success(folderId === null ? "File added to this Workspace." : "File added to this Folder.")
        reset()
        onOpenChange(false)
        onUploaded()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The File could not be uploaded.")
      }
    })
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!uploading) { if (!next) reset(); onOpenChange(next) } }}>
    <DialogContent className="file-upload-dialog">
      <DialogHeader><DialogTitle>Upload a File</DialogTitle><DialogDescription>Add one reusable Workspace File{locationLabel ? ` to ${locationLabel}` : ""}. Processing starts only when a format requires it.</DialogDescription></DialogHeader>
      <FileDropZone file={file} kind="file" accept="audio/*,image/*,video/*,.srt,.vtt,.txt,.md,.pdf,.json,.csv,.zip" hint="Audio, image, video, subtitles, text, PDF, JSON, CSV or ZIP · up to 1 GB" disabled={uploading} onFile={(next) => { setFile(next); setName(next.name.replace(/\.[^.]+$/, "")); setError("") }} />
      {file && <div className="file-upload-fields"><label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label><span>Tags <small>optional, separated by commas</small></span><Input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="reference, final, campaign" /></label></div>}
      {error && <p className="file-upload-error" role="alert">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={uploading} onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button><ActionButton disabled={!file || !name.trim()} busy={uploading} busyLabel="Uploading…" onClick={() => void upload()}><Upload />Upload File</ActionButton></DialogFooter>
    </DialogContent>
  </Dialog>
}
