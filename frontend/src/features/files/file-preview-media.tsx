import { Archive, AudioLines, Captions, Check, CircleAlert, Clock3, Copy, Database, FileText, Image, LoaderCircle, Video } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/format"
import type { WorkspaceFile } from "@/types/domain"
import {
  filePlaybackUrl,
  filePosterUrl,
  fileTextFormat,
  isTextPreviewFile,
  type FileKind,
} from "./file-presentation"

const MAX_TEXT_PREVIEW_BYTES = 2_000_000

function displayText(body: string, format: string) {
  if (format !== "JSON") return body
  try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
}

function FileTextPreview({ file, url }: { file: WorkspaceFile; url: string }) {
  const format = fileTextFormat(file)
  const inlineText = typeof file.text === "string" ? file.text : null
  const tooLarge = Boolean(file.size_bytes && file.size_bytes > MAX_TEXT_PREVIEW_BYTES)
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; text?: string }>({
    status: inlineText !== null ? "ready" : "loading",
    text: inlineText ?? undefined,
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
    if (inlineText !== null) {
      setState({ status: "ready", text: inlineText })
      return
    }
    if (tooLarge) return
    if (!url) {
      setState({ status: "error" })
      return
    }
    const controller = new AbortController()
    setState({ status: "loading" })
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Preview request failed with ${response.status}`)
      setState({ status: "ready", text: await response.text() })
    }).catch((reason: unknown) => {
      if (reason && typeof reason === "object" && "name" in reason && reason.name === "AbortError") return
      setState({ status: "error" })
    })
    return () => controller.abort()
  }, [inlineText, tooLarge, url])

  const text = useMemo(() => displayText(state.text || "", format), [format, state.text])
  async function copyText() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(`${format} copied.`)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error("The File content could not be copied.")
    }
  }

  if (tooLarge) return <div className="file-preview-message"><FileText /><b>Preview unavailable</b><p>Text previews are limited to 2 MB. Download the File to read the complete content.</p></div>
  if (state.status === "loading") return <div className="file-preview-message" role="status"><LoaderCircle className="spin" /><b>Loading {format}</b><p>Reading the File content…</p></div>
  if (state.status === "error") return <div className="file-preview-message" role="alert"><CircleAlert /><b>Preview unavailable</b><p>The File is still safe to download.</p></div>
  return <section className="file-text-preview" aria-label={`${format} preview`}>
    <header><span>{format}</span><Button variant="secondary" size="sm" onClick={() => void copyText()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button></header>
    <pre dir="auto">{text}</pre>
  </section>
}

function FilePreviewFallback({ kind, label }: { kind: FileKind; label: string }) {
  const Icon = kind === "image" ? Image
    : kind === "video" ? Video
      : ["audio", "speech", "music", "sfx"].includes(kind) ? AudioLines
        : kind === "subtitle" ? Captions
          : kind === "data" ? Database
            : kind === "document" ? FileText
              : Archive
  return <div className="file-preview-message"><Icon /><b>{label}</b><p>{kind === "data" ? "This format does not have an inline preview." : "Preview is not available for this File."}</p></div>
}

export function FilePreviewMedia({ file, kind, label, name, url }: {
  file: WorkspaceFile
  kind: FileKind
  label: string
  name: string
  url: string
}) {
  if (kind === "video" && url) return <video src={filePlaybackUrl(file)} poster={filePosterUrl(file)} controls playsInline />
  if (kind === "image" && url) return <img src={url} alt={name} />
  if (url && (file.mime_type === "application/pdf" || /\.pdf$/i.test(String(file.filename || "")))) {
    return <iframe className="file-pdf-preview" src={url} title={`${name} PDF preview`} />
  }
  if (file.media_type === "audio" && url) return <div className="file-audio-preview">
    <AudioLines />
    <b>{label}</b>
    {file.duration_ms ? <small><Clock3 />{formatDuration(file.duration_ms / 1000)}</small> : null}
    <audio aria-label={`Play ${name}`} src={url} controls preload="metadata" />
  </div>
  if (isTextPreviewFile(file)) return <FileTextPreview file={file} url={url} />
  return <FilePreviewFallback kind={kind} label={label} />
}
