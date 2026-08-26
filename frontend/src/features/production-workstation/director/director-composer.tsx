import { ImagePlus, Images, Upload } from "lucide-react"
import { useRef } from "react"

import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { acceptedVisualFiles, visualFileAccept } from "./director-assets"

export function DirectorComposer({ uploading, uploadLabel, onFiles, onOpenLibrary }: {
  uploading: boolean
  uploadLabel: string
  onFiles: (files: File[]) => void
  onOpenLibrary: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function receive(files: FileList | File[]) {
    const accepted = acceptedVisualFiles(files)
    if (accepted.length) onFiles(accepted)
  }

  return <section className="director-composer" aria-label="Add visual material">
    <input ref={inputRef} hidden multiple type="file" accept={visualFileAccept} disabled={uploading} onChange={(event) => {
      if (event.target.files) receive(event.target.files)
      event.target.value = ""
    }} />
    <div className="director-composer-copy">
      <span className="director-composer-icon"><ImagePlus aria-hidden="true" /></span>
      <div>
        <h2>Create the visual world</h2>
        <p>Drop images or video here, paste an image, or bring existing material from your Library.</p>
      </div>
    </div>
    <div className="director-composer-actions">
      <ActionButton busy={uploading} busyLabel={uploadLabel} onClick={() => inputRef.current?.click()}><Upload data-icon="inline-start" /> Upload files</ActionButton>
      <Button variant="outline" disabled={uploading} onClick={onOpenLibrary}><Images data-icon="inline-start" /> Visual Library</Button>
    </div>
    <small>JPG, PNG, WebP, MP4, MOV or WebM · multiple files supported</small>
  </section>
}
