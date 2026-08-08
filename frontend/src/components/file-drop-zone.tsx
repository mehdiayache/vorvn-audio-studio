import { File, FileAudio2, Image, Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import "./file-drop-zone.css"

export function FileDropZone({ file, accept, hint, disabled = false, kind = "audio", emptyLabel, chooseLabel, onFile }: {
  file: File | null
  accept: string
  hint: string
  disabled?: boolean
  kind?: "audio" | "image" | "file"
  emptyLabel?: string
  chooseLabel?: string
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  function choose(files: FileList | null) {
    const next = files?.[0]
    if (next) onFile(next)
  }
  const defaults = kind === "image"
    ? { empty: "Drop a portrait here", choose: "Choose image" }
    : kind === "file"
      ? { empty: "Drop a file here", choose: "Choose file" }
      : { empty: "Drop a voice recording here", choose: "Choose audio" }
  const icon = file
    ? kind === "image" ? <Image /> : kind === "file" ? <File /> : <FileAudio2 />
    : <Upload />
  return <div className={cn("file-drop-zone", dragging && "dragging", file && "has-file", disabled && "disabled")}
    onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) choose(event.dataTransfer.files) }}>
    <input ref={input} hidden type="file" accept={accept} disabled={disabled} onChange={(event) => choose(event.target.files)} />
    <span className="file-drop-icon">{icon}</span>
    <div><b>{file ? file.name : emptyLabel || defaults.empty}</b><span>{file ? `${(file.size / 1_000_000).toFixed(1)} MB · ready` : hint}</span></div>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>{file ? "Replace" : chooseLabel || defaults.choose}</Button>
  </div>
}
