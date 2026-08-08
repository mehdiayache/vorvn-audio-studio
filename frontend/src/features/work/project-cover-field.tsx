import { ImagePlus, Trash2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]
const MAX_BYTES = 8_000_000

export function ProjectCoverField({ value, file, onFileChange, onRemove }: {
  value: string
  file: File | null
  onFileChange: (file: File | null) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState(value)

  useEffect(() => {
    if (!file) { setPreview(value); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, value])

  function choose(next: File | null) {
    setError("")
    if (!next) return
    if (!ACCEPTED.includes(next.type)) { setError("Use a JPG, PNG or WEBP image."); return }
    if (next.size > MAX_BYTES) { setError("Use an image smaller than 8 MB."); return }
    onFileChange(next)
  }

  return <div className="project-cover-field">
    <div
      className={`project-cover-preview${dragging ? " dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0] || null) }}
    >
      {preview ? <img src={preview} alt="Project cover preview" /> : <div><ImagePlus /><b>Add a cover</b><span>Square images work best</span></div>}
      <button type="button" className="project-cover-drop" onClick={() => input.current?.click()} aria-label={preview ? "Replace Project cover" : "Add Project cover"} />
    </div>
    <div className="project-cover-actions">
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}><Upload /> {preview ? "Replace image" : "Choose image"}</Button>
      {preview && <Button type="button" variant="ghost" size="sm" onClick={() => { onFileChange(null); onRemove() }}><Trash2 /> Remove</Button>}
    </div>
    <input ref={input} type="file" accept={ACCEPTED.join(",")} hidden onChange={(event) => choose(event.target.files?.[0] || null)} />
    <small className={error ? "project-cover-error" : ""}>{error || "JPG, PNG or WEBP · maximum 8 MB · drag and drop supported"}</small>
  </div>
}
