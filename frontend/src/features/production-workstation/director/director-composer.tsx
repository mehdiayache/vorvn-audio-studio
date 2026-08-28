import { Images, Sparkles, Upload } from "lucide-react"
import { useRef } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { visualFileAccept, visualUploadHint } from "./director-assets"

export function DirectorComposer({ uploading, uploadLabel, onFiles, onOpenLibrary }: {
  uploading: boolean
  uploadLabel: string
  onFiles: (files: File[]) => void
  onOpenLibrary: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function receive(files: FileList | File[]) {
    const selected = Array.from(files)
    if (selected.length) onFiles(selected)
  }

  return <section className="director-composer" aria-label="Add visual material">
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} disabled={uploading} onChange={(event) => {
      if (event.target.files) receive(event.target.files)
      event.target.value = ""
    }} />
    <div className="director-composer-prompt">
      <Textarea
        aria-label="Visual direction"
        aria-describedby="director-composer-status"
        placeholder="Describe, find, upload or create something…"
        readOnly
        rows={3}
      />
    </div>
    <footer>
      <div className="director-composer-actions">
        <ActionButton busy={uploading} busyLabel={uploadLabel} onClick={() => inputRef.current?.click()}><Upload data-icon="inline-start" /> Upload</ActionButton>
        <Button variant="outline" disabled={uploading} onClick={onOpenLibrary}><Images data-icon="inline-start" /> Library</Button>
      </div>
      <p id="director-composer-status"><Sparkles aria-hidden="true" /> Creation providers will connect here later. Upload and Library work now.</p>
      <small>{visualUploadHint} · multiple files supported</small>
    </footer>
  </section>
}
