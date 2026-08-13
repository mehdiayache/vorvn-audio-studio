import { Captions, Download, Languages, LoaderCircle, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { OperationState } from "@/components/operation-state"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CaptionConfirmation } from "@/hooks/use-part-detail-data"
import { formatDuration } from "@/lib/format"
import type { CaptionMutationResult, DurableJob, Transcript, TranscriptSummary } from "@/types/domain"

function downloadText(filename: string, body: string) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }))
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function PartCaptionPanel({ captions, transcript, languages, sourceLanguage, loading, busy, confirmation, job, onSelect, onCreate, onTranslate, onConfirm, onCancel, onRetryJob, onDismissJob }: {
  captions: TranscriptSummary[]
  transcript: Transcript | null
  languages: string[]
  sourceLanguage?: string
  loading: boolean
  busy: "transcribe" | "translate" | null
  confirmation: CaptionConfirmation | null
  job: DurableJob<CaptionMutationResult> | null
  onSelect: (item: TranscriptSummary) => Promise<void>
  onCreate: () => Promise<void>
  onTranslate: (target: string) => Promise<void>
  onConfirm: () => Promise<void>
  onCancel: () => void
  onRetryJob: () => Promise<void>
  onDismissJob: () => void
}) {
  const [format, setFormat] = useState<"text" | "srt" | "vtt">("text")
  const availableLanguages = useMemo(() => {
    const existing = new Set(captions.map((item) => item.language?.toLowerCase()).filter(Boolean))
    return languages.filter((language) => language !== "Auto" && language.toLowerCase() !== sourceLanguage?.toLowerCase() && !existing.has(language.toLowerCase()))
  }, [captions, languages, sourceLanguage])
  const [target, setTarget] = useState("")
  const selectedTarget = availableLanguages.includes(target) ? target : availableLanguages[0] || ""
  const original = captions.find((item) => !item.is_translation)
  const needsRefresh = Boolean(original?.stale)
  const body = transcript ? transcript[format] : ""

  return <div className="detail-body caption-detail">
    {job && <OperationState job={job} title={job.type === "translate" ? "Subtitle translation" : "Create subtitles"} onConfirm={confirmation ? () => void onConfirm() : undefined} onRetry={job.status === "failed" ? () => void onRetryJob() : undefined} onDismiss={!busy && !confirmation ? onDismissJob : undefined} />}
    <section>
      <div className="detail-section-head caption-actions">
        <div><h3>Subtitles</h3><p>Create timed text from the current take, then translate it when needed.</p></div>
        <Button disabled={Boolean(busy)} onClick={() => void onCreate()}>{busy === "transcribe" ? <LoaderCircle className="spin" /> : needsRefresh ? <RefreshCw /> : <Captions />}{busy === "transcribe" ? "Listening…" : needsRefresh ? "Regenerate" : original ? "Regenerate" : "Create subtitles"}</Button>
      </div>
      {original && !needsRefresh && <div className="caption-translate-bar"><Languages /><span>Translate subtitles</span><Select value={selectedTarget} onValueChange={setTarget} disabled={!availableLanguages.length}><SelectTrigger aria-label="Translation language"><SelectValue placeholder="Choose language" /></SelectTrigger><SelectContent>{availableLanguages.map((language) => <SelectItem key={language} value={language}>{language}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!selectedTarget || busy === "translate"} onClick={() => void onTranslate(selectedTarget)}>{busy === "translate" ? <LoaderCircle className="spin" /> : <Languages />}{busy === "translate" ? "Translating…" : "Translate"}</Button></div>}
    </section>

    <section><h3>Caption files</h3>{loading ? <p className="detail-loading"><LoaderCircle className="spin" /> Loading captions…</p> : captions.length ? captions.map((item) => <button className="caption-row" key={item.id} onClick={() => void onSelect(item)}><Captions /><span><b>{item.is_translation ? item.language || "Translation" : "Original"}</b><small>{item.is_translation ? "Translation" : item.language || "Detected language"} · {formatDuration(Number(item.duration_ms || 0) / 1000)}</small></span>{item.stale && <Badge variant="destructive">Out of date</Badge>}</button>) : <p className="detail-empty">No subtitles yet. Use “Create subtitles” above to make timed captions from this recording.</p>}</section>

    {transcript && <section className="caption-preview"><div className="caption-preview-head"><Tabs value={format} onValueChange={(value) => setFormat(value as typeof format)}><TabsList><TabsTrigger value="text">Text</TabsTrigger><TabsTrigger value="srt">SRT</TabsTrigger><TabsTrigger value="vtt">VTT</TabsTrigger></TabsList></Tabs><Button variant="outline" onClick={() => downloadText(`${transcript.file.replace(/\.[^.]+$/, "")}.${format === "text" ? "txt" : format}`, body)}><Download /> Download</Button></div><pre dir="auto">{body}</pre></section>}

    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) onCancel() }}><DialogContent><DialogHeader><DialogTitle>{confirmation?.kind === "translate" ? `Translate into ${confirmation.target}?` : "Create subtitles?"}</DialogTitle><DialogDescription>This provider operation is estimated at ${Number(confirmation?.estimate || 0).toFixed(4)}. Actual usage and cost are saved after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={() => void onConfirm()}>Continue</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
