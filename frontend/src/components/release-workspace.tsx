import { Captions, CheckCircle2, CircleAlert, Download, FileAudio, LoaderCircle, Music2, PackageCheck, Pause, Play } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MusicBed, Production } from "@/types/domain"

export function ReleaseWorkspace({ production, music, previewing, productionPlaying, onPreview, onExport, exporting }: { production: Production; music: MusicBed; previewing: boolean; productionPlaying: boolean; onPreview: () => void; onExport: () => void; exporting: boolean }) {
  const drafts = production.parts.filter((part) => part.kind === "draft").length
  const missing = production.parts.filter((part) => part.missing).length
  const ready = drafts === 0 && missing === 0 && production.parts.some((part) => part.filename)
  const exports = production.exports
  return (
    <section className="release-workspace">
      <div className="release-readiness">
        <span className={ready ? "ready" : "blocked"}>{ready ? <PackageCheck /> : <CircleAlert />}</span>
        <div><span className="eyebrow">Release readiness</span><h2>{ready ? "Ready to make an MP3" : "This Production needs attention"}</h2><p>{ready ? "The source sequence can be rendered with its current music and captions." : "Resolve every blocking source issue before making a final file."}</p></div>
        <Button variant="outline" onClick={onPreview} disabled={previewing}>{previewing ? <LoaderCircle className="spin" /> : productionPlaying ? <Pause /> : <Play />}{previewing ? "Preparing exact mix…" : productionPlaying ? "Pause exact mix" : "Preview exact mix"}</Button>
      </div>
      <div className="readiness-grid">
        <article className={drafts ? "issue" : "ok"}>{drafts ? <CircleAlert /> : <CheckCircle2 />}<div><b>Recorded sequence</b><span>{drafts ? `${drafts} draft${drafts === 1 ? "" : "s"} still need audio` : "No unrecorded drafts"}</span></div></article>
        <article className={missing ? "issue" : "ok"}>{missing ? <CircleAlert /> : <CheckCircle2 />}<div><b>Linked media</b><span>{missing ? `${missing} source file${missing === 1 ? " is" : "s are"} missing` : "Every source is available"}</span></div></article>
        <article className="ok"><Music2 /><div><b>Background</b><span>{music.filename ? music.name || "Music bed selected" : "Narration only"}</span></div></article>
        <article className="ok"><Captions /><div><b>Captions</b><span>{production.parts.filter((part) => part.subtitled).length} parts captioned</span></div></article>
      </div>
      <section className="export-panel">
        <div><span className="eyebrow">Final output</span><h2>MP3 · 192 kbps</h2><p>Local FFmpeg render. Creating the file does not call Alibaba or add generation cost.</p></div>
        <Button disabled={!ready || exporting} onClick={onExport}><Download /> {exporting ? "Making MP3…" : "Make MP3"}</Button>
      </section>
      <section className="export-history"><header><div><span className="eyebrow">Published versions</span><h2>Export history</h2></div><Badge variant="outline">{exports.length}</Badge></header>{exports.length ? exports.map((item) => <article key={item.id}><FileAudio /><div><b>{item.filename}</b><span>{item.created_at.slice(0, 16).replace("T", " ")}</span></div><Button variant="outline" asChild><a href={`/api/v1/exports/${item.id}/download`}><Download /> Download</a></Button></article>) : <p>No final MP3 has been made from this Production yet.</p>}</section>
    </section>
  )
}
