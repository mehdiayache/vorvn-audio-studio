import { Captions, CheckCircle2, CircleAlert, Download, FileAudio, LoaderCircle, Music2, PackageCheck, Pause, Play, Waves } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration, partDurationMs } from "@/lib/format"
import type { DurableJob, MusicBed, Production } from "@/types/domain"

import "@/features/production/mix-export-workspace.css"

type ExportResult = { url?: string; name?: string; error?: string }

export function MixExportWorkspace({ production, music, previewing, productionPlaying, exportJob, onPreview, onExport, exporting }: {
  production: Production
  music: MusicBed
  previewing: boolean
  productionPlaying: boolean
  exportJob: DurableJob<ExportResult> | null
  onPreview: () => void
  onExport: () => void
  exporting: boolean
}) {
  const sequence = production.parts.filter((part) => part.kind !== "stitch")
  const unrecorded = sequence.filter((part) => part.kind === "draft" || (part.kind === "speech" && !part.selected_take_id)).length
  const missing = sequence.filter((part) => part.missing).length
  const outdated = sequence.filter((part) => part.outdated).length
  const staleCaptions = sequence.filter((part) => part.subtitles_stale).length
  const selectedTakes = sequence.filter((part) => part.selected_take_id).length
  const duration = sequence.reduce((total, part) => total + partDurationMs(part), 0)
  const ready = unrecorded === 0 && missing === 0 && sequence.some((part) => part.filename)
  const progress = Math.round(Number(exportJob?.progress || 0) * 100)
  return <section className="mix-export-workspace">
    <div className="mix-readiness">
      <span className={ready ? "ready" : "blocked"}>{ready ? <PackageCheck /> : <CircleAlert />}</span>
      <div><span className="eyebrow">Current mix</span><h2>{ready ? "Ready to export" : "Resolve blocking sequence issues"}</h2><p>{ready ? "The export uses the current order, selected Takes, Venture audio and music settings." : "Every speech Part needs a selected Take and every linked source must exist."}</p></div>
      <Button variant="outline" onClick={onPreview} disabled={previewing}>{previewing ? <LoaderCircle className="spin" /> : productionPlaying ? <Pause /> : <Play />}{previewing ? "Preparing…" : productionPlaying ? "Pause preview" : "Preview current mix"}</Button>
    </div>
    <div className="mix-summary-grid" aria-label="Current mix summary">
      <article><Waves /><span><b>{sequence.length} Parts</b><small>{formatDuration(duration / 1000)} total</small></span></article>
      <article className={unrecorded ? "issue" : "ok"}>{unrecorded ? <CircleAlert /> : <CheckCircle2 />}<span><b>{selectedTakes} selected Takes</b><small>{unrecorded ? `${unrecorded} speech Part${unrecorded === 1 ? "" : "s"} not recorded` : "Every speech Part has audio"}</small></span></article>
      <article className={missing ? "issue" : "ok"}>{missing ? <CircleAlert /> : <CheckCircle2 />}<span><b>Linked media</b><small>{missing ? `${missing} source file${missing === 1 ? " is" : "s are"} missing` : "Every source is available"}</small></span></article>
      <article><Music2 /><span><b>{music.filename ? music.name || "Music selected" : "Narration only"}</b><small>{music.filename ? `${Math.round(Number(music.volume ?? 0.18) * 100)}% · ${music.duck ? "ducking on" : "no ducking"}` : "No background bed"}</small></span></article>
      <article className={outdated ? "warning" : "ok"}>{outdated ? <CircleAlert /> : <CheckCircle2 />}<span><b>{outdated ? `${outdated} outdated Take${outdated === 1 ? "" : "s"}` : "Takes match current Parts"}</b><small>{outdated ? "Review before release" : "No revision mismatch"}</small></span></article>
      <article className={staleCaptions ? "warning" : "ok"}><Captions /><span><b>{sequence.filter((part) => part.subtitled).length} Parts captioned</b><small>{staleCaptions ? `${staleCaptions} caption set${staleCaptions === 1 ? "" : "s"} need refresh` : "No stale captions"}</small></span></article>
    </div>
    <section className="mix-export-panel"><div><span className="eyebrow">Final output</span><h2>MP3 · 192 kbps</h2><p>Local FFmpeg render. Export does not call a speech provider or add generation cost.</p></div><Button disabled={!ready || exporting} onClick={onExport}><Download /> {exporting ? "Making MP3…" : "Make MP3"}</Button></section>
    {exportJob && <section className={`mix-export-job is-${exportJob.status}`} aria-live="polite"><div><b>{exportJob.status === "ok" || exportJob.status === "warning" ? "Export ready" : exportJob.status === "failed" ? "Export failed" : "Export in progress"}</b><span>{exportJob.error || exportJob.detail || `${progress}% complete`}</span></div>{exporting && <progress max={100} value={progress} />}{exportJob.result.url && <Button variant="outline" asChild><a href={exportJob.result.url}><Download /> Download</a></Button>}</section>}
    <section className="mix-export-history"><header><div><span className="eyebrow">Output history</span><h2>Previous exports</h2></div><Badge variant="outline">{production.exports.length}</Badge></header>{production.exports.length ? production.exports.map((item) => <article key={item.id}><FileAudio /><div><b>{item.filename}</b><span>{item.duration_ms ? formatDuration(item.duration_ms / 1000) : "Duration unavailable"} · {item.created_at.slice(0, 16).replace("T", " ")}</span></div><Button variant="outline" asChild><a href={`/api/v1/exports/${item.id}/download`}><Download /> Download</a></Button></article>) : <p>No final MP3 has been made from this Production yet.</p>}</section>
  </section>
}
