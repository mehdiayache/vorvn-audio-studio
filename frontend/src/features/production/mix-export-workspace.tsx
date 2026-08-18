import { Captions, CheckCircle2, CircleAlert, Download, FileAudio, LoaderCircle, Music2, PackageCheck, Pause, Play, RefreshCw, ShieldCheck, Waves } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatDuration } from "@/lib/format"
import type { DurableJob, Production, ProductionPart, SoundScene } from "@/types/domain"

import "@/features/production/mix-export-workspace.css"

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
  return {
    sequence,
    issues,
    blocking,
    review: issues.filter((issue) => !issue.blocking),
    ready: renderable.length > 0 && blocking.length === 0,
    previewAvailable: renderable.length > 0 && !renderable.some((part) => part.missing),
  }
}

function fileSize(bytes: number) {
  if (!bytes) return "Size unavailable"
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

export function MixExportWorkspace({ production, soundScene, previewing, productionPlaying, previewReady, previewStale, exportJob, onPreview, onExport, onLocatePart, onOpenHealth, exporting }: {
  production: Production
  soundScene: SoundScene
  previewing: boolean
  productionPlaying: boolean
  previewReady: boolean
  previewStale: boolean
  exportJob: DurableJob<ExportResult> | null
  onPreview: () => void
  onExport: () => void
  onLocatePart: (id: number) => void
  onOpenHealth: () => void
  exporting: boolean
}) {
  const readiness = productionMixReadiness(production)
  const { sequence, blocking, review, ready } = readiness
  const recordedParts = sequence.filter((part) => part.clip_id).length
  const speechParts = sequence.filter((part) => part.kind === "speech" || part.kind === "draft").length
  const linkedMedia = sequence.filter((part) => part.kind === "asset").length
  const captioned = sequence.filter((part) => part.subtitled).length
  const draftCount = sequence.filter((part) => part.kind === "draft" || (part.kind === "speech" && !part.clip_id)).length
  const duration = soundScene.resolved.sequence_projection.duration_ms
  const progress = Math.round(Number(exportJob?.progress || 0) * 100)
  const exportComplete = Boolean(exportJob && ["ok", "warning"].includes(exportJob.status))
  const exportDetail = exportComplete ? exportJob?.status === "warning" && exportJob.detail ? exportJob.detail : "Finished and recorded as an immutable Production output." : exportJob?.error || exportJob?.detail || `${progress}% complete`
  const previewLabel = previewing ? "Preparing…" : previewStale ? "Refresh preview" : productionPlaying ? "Pause preview" : previewReady ? "Play current preview" : draftCount ? "Preview recorded Parts" : "Prepare current preview"
  const musicTrack = soundScene.resolved.tracks.find((track) => track.kind === "music")
  const musicClip = musicTrack?.clips.find((clip) => !clip.orphan)
  return <section className="mix-export-workspace">
    <header className={`mix-readiness ${ready ? "is-ready" : "is-blocked"}`}>
      <span>{ready ? <PackageCheck /> : <CircleAlert />}</span>
      <div><span className="eyebrow">Release readiness</span><h2>{ready ? "Current audio is exportable" : `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}`}</h2><p>{ready ? draftCount ? `${draftCount} planned Speech Part${draftCount === 1 ? " is" : "s are"} outside the current audio. You can export the recorded work after confirming.` : "The current order, active recordings, linked media and Music settings can be rendered now." : "Restore missing or broken media before creating the final file. Planned Drafts do not block the current audio."}</p></div>
      <Button variant={previewStale ? "secondary" : "outline"} onClick={onPreview} disabled={previewing || !readiness.previewAvailable}>{previewing ? <LoaderCircle className="spin" /> : previewStale ? <RefreshCw /> : productionPlaying ? <Pause /> : <Play />}{previewLabel}</Button>
    </header>

    <section className="mix-section mix-current" aria-label="Current mix summary">
      <header><div><span className="eyebrow">Current mix</span><h3>What the next output will contain</h3></div><Badge variant={previewStale ? "secondary" : previewReady ? "outline" : "secondary"}>{previewStale ? "Preview stale" : previewReady ? "Preview current" : "Not previewed"}</Badge></header>
      <dl className="mix-fact-list">
        <div><dt><Waves /> Sequence</dt><dd><b>{soundScene.resolved.sequence_projection.spans.length} audible Parts · {formatDuration(duration / 1000)}</b><span>{draftCount ? `${draftCount} planned Draft${draftCount === 1 ? " is" : "s are"} not part of current timing` : "Current canonical audio order"}</span></dd></div>
        <div className={blocking.some((issue) => issue.title === "Speech recording missing") ? "is-blocking" : "is-clear"}><dt><CheckCircle2 /> Speech</dt><dd><b>{recordedParts} of {speechParts} recorded</b><span>{speechParts - recordedParts ? `${speechParts - recordedParts} planned for later recording` : "Every Speech Part has one active recording"}</span></dd></div>
        <div className={blocking.some((issue) => issue.title === "Linked media missing") ? "is-blocking" : "is-clear"}><dt><FileAudio /> Linked media</dt><dd><b>{linkedMedia ? `${linkedMedia} Venture asset${linkedMedia === 1 ? "" : "s"}` : "No linked Venture audio"}</b><span>{blocking.some((issue) => issue.title === "Linked media missing") ? "At least one exact source is missing" : "All linked sources are available"}</span></dd></div>
        <div><dt><Music2 /> Music</dt><dd><b>{musicClip ? musicClip.asset_name || "Music selected" : "Narration only"}</b><span>{musicClip ? `${Math.round(Number(musicClip.gain ?? 1) * 100)}% level · ${musicTrack?.muted ? "muted" : musicClip.loop ? "looping" : "plays once"}` : "No parallel Music clip in this Sound Scene"}</span></dd></div>
        <div className={review.some((issue) => issue.title === "Captions are stale") ? "is-review" : "is-clear"}><dt><Captions /> Captions</dt><dd><b>{captioned} captioned Part{captioned === 1 ? "" : "s"}</b><span>{review.filter((issue) => issue.title === "Captions are stale").length ? "Some caption sets are stale" : "Current caption sets will be packaged when available"}</span></dd></div>
        <div><dt><ShieldCheck /> Output</dt><dd><b>MP3 · 192 kbps · 48 kHz stereo</b><span>Local FFmpeg finishing · immutable output record</span></dd></div>
      </dl>
    </section>

    {(blocking.length > 0 || review.length > 0) && <section className="mix-section mix-issues">
      <header><div><span className="eyebrow">Release checks</span><h3>Exact Parts requiring attention</h3></div><Button variant="ghost" size="sm" onClick={onOpenHealth}>Open Production health</Button></header>
      <div className="mix-issue-list">
        {[...blocking, ...review].slice(0, 12).map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocatePart(issue.part.id)}><span className={issue.blocking ? "is-blocking" : "is-review"}><CircleAlert /></span><span><b>Part {issue.number} · {issue.title}</b><small>{issue.detail}</small></span><span>Locate</span></button>)}
        {blocking.length + review.length > 12 && <Button variant="outline" onClick={onOpenHealth}>View all {blocking.length + review.length} issues in Health</Button>}
      </div>
    </section>}

    <section className="mix-export-panel"><div><span className="eyebrow">Create immutable output</span><h3>Final MP3</h3><p>{draftCount ? `${draftCount} planned Draft${draftCount === 1 ? "" : "s"} will stay in Sequence and remain outside this file. You will confirm before export.` : "Export is local finishing. It does not call a speech provider, replace a recording, or add provider generation spend."}</p></div><Button disabled={!ready || exporting} onClick={onExport}><Download /> {exporting ? "Making MP3…" : draftCount ? "Export recorded audio" : "Make MP3"}</Button></section>
    {exportJob && <section className={`mix-export-job is-${exportJob.status}`} aria-live="polite"><div><b>{exportComplete ? "Export ready" : ["failed", "lost", "cancelled"].includes(exportJob.status) ? "Export failed" : "Export in progress"}</b><span>{exportDetail}</span></div>{exporting && <Progress value={progress} aria-label={`Export ${progress}% complete`} />}{exportJob.result.url && <Button variant="outline" asChild><a href={exportJob.result.url}><Download /> Download</a></Button>}</section>}
    <section className="mix-export-history"><header><div><span className="eyebrow">Immutable output history</span><h3>Previous exports</h3></div><Badge variant="outline">{production.exports.length}</Badge></header>{production.exports.length ? <div>{production.exports.map((item) => <article key={item.id}><FileAudio /><div><b>{item.filename}</b><span>{item.duration_ms ? formatDuration(item.duration_ms / 1000) : "Duration unavailable"} · {fileSize(item.size_bytes)} · {item.renderer}</span><small>{item.created_at.slice(0, 16).replace("T", " ")} · preserved independently of later Production edits</small></div><Badge variant="outline">Immutable</Badge><Button variant="ghost" size="sm" asChild><a href={`/api/v1/exports/${item.id}/download`}><Download /> Download</a></Button></article>)}</div> : <p>No immutable MP3 has been made from this Production yet.</p>}</section>
  </section>
}
