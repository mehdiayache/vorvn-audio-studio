import { Captions, CheckCircle2, CircleAlert, Download, FileAudio, FileVideo2, Music2, PackageCheck, ShieldCheck, Waves } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatDuration } from "@/lib/format"
import type { DurableJob, Production, ProductionPart, SoundScene, VisualScene } from "@/types/domain"

import "@/features/productions/audiovisual/support/mix-export-workspace.css"

type ExportFormat = "mp3" | "mp4"
type ExportResult = { url?: string; name?: string; error?: string }
export type MixReadinessIssue = { part: ProductionPart; number: number; title: string; detail: string; blocking: boolean }

export function productionMixReadiness(production: Production) {
  const sequence = production.parts.filter((part) => part.kind !== "stitch" && part.enabled !== false)
  const issues = sequence.flatMap<MixReadinessIssue>((part, index) => {
    const found: MixReadinessIssue[] = []
    if (part.kind === "speech" && !part.clip_id) found.push({ part, number: index + 1, title: "Speech recording missing", detail: "Restore or record this Speech Part before export.", blocking: true })
    if (part.missing) found.push({ part, number: index + 1, title: "Linked media missing", detail: "Restore or replace the exact linked source before export.", blocking: true })
    if (part.outdated) found.push({ part, number: index + 1, title: "Recording is outdated", detail: "Replace the recording so it matches the current Part wording.", blocking: false })
    if (part.subtitles_stale) found.push({ part, number: index + 1, title: "Captions are stale", detail: "Refresh captions if they should accompany the next output.", blocking: false })
    return found
  })
  const renderable = sequence.filter((part) => part.kind !== "draft")
  const blocking = issues.filter((issue) => issue.blocking)
  return { sequence, issues, blocking, review: issues.filter((issue) => !issue.blocking), ready: renderable.length > 0 && blocking.length === 0 }
}

function fileSize(bytes: number) {
  if (!bytes) return "Size unavailable"
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

function exportFormat(filename: string) {
  return filename.toLowerCase().endsWith(".mp4") ? "MP4" : "MP3"
}

export function MixExportWorkspace({ production, soundScene, visualScene, exportJob, onExport, onLocatePart, onOpenHealth, exporting, exportingFormat }: {
  production: Production
  soundScene: SoundScene
  visualScene: VisualScene
  exportJob: DurableJob<ExportResult> | null
  onExport: (format: ExportFormat) => void
  onLocatePart: (id: number) => void
  onOpenHealth: () => void
  exporting: boolean
  exportingFormat: ExportFormat | null
}) {
  const readiness = productionMixReadiness(production)
  const { sequence, blocking, review, ready } = readiness
  const recordedParts = sequence.filter((part) => part.clip_id).length
  const speechParts = sequence.filter((part) => part.kind === "speech" || part.kind === "draft").length
  const linkedMedia = sequence.filter((part) => part.kind === "file").length
  const captioned = sequence.filter((part) => part.subtitled).length
  const draftCount = sequence.filter((part) => part.kind === "draft" || (part.kind === "speech" && !part.clip_id)).length
  const duration = soundScene.resolved.sequence_projection.duration_ms
  const audioTracks = soundScene.resolved.tracks.filter((track) => !track.muted)
  const audioClips = audioTracks.flatMap((track) => track.clips.filter((clip) => !clip.orphan && !clip.muted))
  const firstAudioClip = audioClips[0]
  const visibleVisualTracks = visualScene.document.tracks.filter((track) => track.visible)
  const visualClips = visibleVisualTracks.flatMap((track) => track.clips)
  const visualKinds = new Set(visibleVisualTracks.filter((track) => track.clips.length).map((track) => track.media_type))
  const canExportVideo = ready && visualClips.length > 0
  const progress = Math.round(Number(exportJob?.progress || 0) * 100)
  const exportComplete = Boolean(exportJob && ["ok", "warning"].includes(exportJob.status))
  const resultFormat = exportFormat(exportJob?.result.name || "output.mp3")
  const exportDetail = exportComplete
    ? exportJob?.status === "warning" && exportJob.detail ? exportJob.detail : "Your file is ready to download."
    : exportJob?.error || exportJob?.detail || `${progress}% complete`

  return <section className="mix-export-workspace">
    <header className={`mix-readiness ${ready ? "is-ready" : "is-blocked"}`}>
      <span>{ready ? <PackageCheck /> : <CircleAlert />}</span>
      <div><span className="eyebrow">Export readiness</span><h2>{ready ? "Ready to export" : `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}`}</h2><p>{ready ? draftCount ? `${draftCount} planned Speech Part${draftCount === 1 ? " is" : "s are"} outside the current Timeline. Confirm once, then export the recorded work.` : "Timeline playback already shows the result. Choose an audio or video file below." : "Restore missing or broken media before exporting. Planned Drafts do not block the recorded work."}</p></div>
    </header>

    <section className="mix-section mix-current" aria-label="Current export summary">
      <header><div><span className="eyebrow">Current Timeline</span><h3>What the file will contain</h3></div></header>
      <dl className="mix-fact-list">
        <div><dt><Waves /> Script</dt><dd><b>{soundScene.resolved.sequence_projection.spans.length} audible Parts · {formatDuration(duration / 1000)}</b><span>{draftCount ? `${draftCount} planned Draft${draftCount === 1 ? " is" : "s are"} not part of current timing` : "Current Script order"}</span></dd></div>
        <div className={blocking.some((issue) => issue.title === "Speech recording missing") ? "is-blocking" : "is-clear"}><dt><CheckCircle2 /> Speech</dt><dd><b>{recordedParts} of {speechParts} recorded</b><span>{speechParts - recordedParts ? `${speechParts - recordedParts} planned for later recording` : "Every Speech Part has audio"}</span></dd></div>
        <div className={blocking.some((issue) => issue.title === "Linked media missing") ? "is-blocking" : "is-clear"}><dt><FileAudio /> Linked media</dt><dd><b>{linkedMedia ? `${linkedMedia} reusable sound${linkedMedia === 1 ? "" : "s"}` : "No linked audio"}</b><span>{blocking.some((issue) => issue.title === "Linked media missing") ? "At least one exact source is missing" : "All linked sources are available"}</span></dd></div>
        <div><dt><Music2 /> Audio tracks</dt><dd><b>{audioClips.length ? `${audioClips.length} audio clip${audioClips.length === 1 ? "" : "s"}` : "Script only"}</b><span>{firstAudioClip ? `${firstAudioClip.file_name || "Audio selected"}${firstAudioClip.loop ? " · looping" : ""}` : "No parallel audio clips"}</span></dd></div>
        <div><dt><FileVideo2 /> Visuals</dt><dd><b>{visualClips.length ? `${visualClips.length} placed ${visualClips.length === 1 ? "visual" : "visuals"}` : "No image or video placed"}</b><span>{visualClips.length ? `${[...visualKinds].map((kind) => kind === "image" ? "Images" : "Videos").join(" + ")} · ${visualScene.document.canvas.width} × ${visualScene.document.canvas.height}` : "MP3 is available; add a visual in Timeline to export MP4"}</span></dd></div>
        <div className={review.some((issue) => issue.title === "Captions are stale") ? "is-review" : "is-clear"}><dt><Captions /> Captions</dt><dd><b>{captioned} captioned Part{captioned === 1 ? "" : "s"}</b><span>{review.filter((issue) => issue.title === "Captions are stale").length ? "Some caption sets are stale" : "Current captions are packaged as sidecar files"}</span></dd></div>
        <div><dt><ShieldCheck /> Files</dt><dd><b>MP3 audio · MP4 video</b><span>48 kHz stereo audio · H.264/AAC video</span></dd></div>
      </dl>
    </section>

    {(blocking.length > 0 || review.length > 0) && <section className="mix-section mix-issues">
      <header><div><span className="eyebrow">Export checks</span><h3>Exact Parts requiring attention</h3></div><Button variant="ghost" size="sm" onClick={onOpenHealth}>Open Production health</Button></header>
      <div className="mix-issue-list">
        {[...blocking, ...review].slice(0, 12).map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocatePart(issue.part.id)}><span className={issue.blocking ? "is-blocking" : "is-review"}><CircleAlert /></span><span><b>Part {issue.number} · {issue.title}</b><small>{issue.detail}</small></span><span>Locate</span></button>)}
        {blocking.length + review.length > 12 && <Button variant="outline" onClick={onOpenHealth}>View all {blocking.length + review.length} issues in Health</Button>}
      </div>
    </section>}

    <section className="mix-export-panel" aria-label="Export formats">
      <header><div><span className="eyebrow">Export</span><h3>Choose a file</h3></div><p>No provider call or generation spend.</p></header>
      <div className="mix-export-choice"><FileAudio /><div><b>Audio</b><span>Full Timeline mix · MP3</span></div><Button disabled={!ready || exporting} onClick={() => onExport("mp3")}><Download /> {exportingFormat === "mp3" ? "Exporting MP3…" : "Export MP3"}</Button></div>
      <div className="mix-export-choice"><FileVideo2 /><div><b>Video</b><span>{visualClips.length ? `Timeline visuals + full audio mix · ${visualScene.document.canvas.width} × ${visualScene.document.canvas.height}` : "Add an image or video to Timeline first"}</span></div><Button disabled={!canExportVideo || exporting} onClick={() => onExport("mp4")}><Download /> {exportingFormat === "mp4" ? "Exporting MP4…" : "Export MP4"}</Button></div>
    </section>

    {exportJob && <section className={`mix-export-job is-${exportJob.status}`} aria-live="polite"><div><b>{exportComplete ? `${resultFormat} ready` : ["failed", "lost", "cancelled"].includes(exportJob.status) ? "Export failed" : "Export in progress"}</b><span>{exportDetail}</span></div>{exporting && <Progress value={progress} aria-label={`Export ${progress}% complete`} />}{exportJob.result.url && <Button variant="outline" asChild><a href={exportJob.result.url} download={exportJob.result.name || undefined}><Download /> Download {resultFormat}</a></Button>}</section>}
    <section className="mix-export-history"><header><div><span className="eyebrow">Saved files</span><h3>Previous exports</h3></div><Badge variant="outline">{production.exports.length}</Badge></header>{production.exports.length ? <div>{production.exports.map((item) => { const format = exportFormat(item.filename); const Icon = format === "MP4" ? FileVideo2 : FileAudio; return <article key={item.id}><Icon /><div><b>{item.filename}</b><span>{item.duration_ms ? formatDuration(item.duration_ms / 1000) : "Duration unavailable"} · {fileSize(item.size_bytes)} · {format}</span><small>{item.created_at.slice(0, 16).replace("T", " ")}</small></div><Badge variant="outline">{format}</Badge><Button variant="ghost" size="sm" asChild><a href={`/api/v1/exports/${item.id}/download`} download={item.filename}><Download /> Download {format}</a></Button></article> })}</div> : <p>No exported files yet.</p>}</section>
  </section>
}
