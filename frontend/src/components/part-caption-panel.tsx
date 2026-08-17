import { Captions, CircleAlert, Download, FileJson, Languages, LoaderCircle, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { CaptionStylePicker } from "@/components/caption-style-picker"
import { Badge } from "@/components/ui/badge"
import { OperationState } from "@/components/operation-state"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CaptionConfirmation } from "@/hooks/use-part-detail-data"
import { useCaptionPresentation } from "@/lib/caption-presentation"
import { formatDuration } from "@/lib/format"
import { studioApi } from "@/lib/api"
import type { CaptionLayout, CaptionMutationResult, DurableJob, Transcript, TranscriptSummary } from "@/types/domain"

function downloadText(filename: string, body: string) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }))
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function originalCaptionLabel(language?: string | null) {
  const value = String(language || "").trim()
  return value ? `${value} · Original` : "Original captions"
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
  onCreate: (language?: string) => Promise<void>
  onTranslate: (target: string) => Promise<void>
  onConfirm: () => Promise<void>
  onCancel: () => void
  onRetryJob: () => Promise<void>
  onDismissJob: () => void
}) {
  const [format, setFormat] = useState<"text" | "srt" | "vtt" | "json">("text")
  const [profile, setProfile] = useCaptionPresentation()
  const [layout, setLayout] = useState<CaptionLayout | null>(null)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const original = captions.find((item) => !item.is_translation)
  const recordedLanguage = sourceLanguage && sourceLanguage.toLowerCase() !== "auto" ? sourceLanguage : undefined
  const selectedLanguage = original?.language || transcript?.language || recordedLanguage
  const availableLanguages = useMemo(() => {
    const existing = new Set(captions.map((item) => item.language?.toLowerCase()).filter(Boolean))
    return languages.filter((language) => language !== "Auto" && language.toLowerCase() !== selectedLanguage?.toLowerCase() && !existing.has(language.toLowerCase()))
  }, [captions, languages, selectedLanguage])
  const [target, setTarget] = useState("")
  const selectedTarget = availableLanguages.includes(target) ? target : availableLanguages[0] || ""
  const sourceChoices = useMemo(() => ["Auto", ...Array.from(new Set(languages.filter((language) => language && language !== "Auto")))], [languages])
  const [captionLanguage, setCaptionLanguage] = useState("Auto")
  const needsRefresh = Boolean(original?.stale)
  const selectedSummary = transcript ? captions.find((item) => item.id === transcript.id) : null

  useEffect(() => {
    setCaptionLanguage(selectedLanguage && sourceChoices.includes(selectedLanguage) ? selectedLanguage : "Auto")
  }, [selectedLanguage, sourceChoices])

  useEffect(() => {
    if (!transcript?.id) { setLayout(null); return }
    let current = true
    setLayoutBusy(true)
    void studioApi.subtitleLayout(transcript.id, profile)
      .then((next) => { if (current) setLayout(next) })
      .catch(() => { if (current) setLayout(null) })
      .finally(() => { if (current) setLayoutBusy(false) })
    return () => { current = false }
  }, [profile, transcript?.id])

  const displayCues = layout?.cues || transcript?.sentences || []
  const body = transcript ? format === "json"
    ? layout?.timing_json || JSON.stringify({ language: transcript.language, duration_ms: transcript.duration_ms, cues: displayCues }, null, 2)
    : format === "text" ? displayCues.map((cue) => cue.text.replace(/\n/g, " ")).join("\n")
      : layout?.[format] || transcript[format]
    : ""
  const providerTimed = transcript?.timing_source === "provider_word_timestamps"
  const createLabel = busy === "transcribe" ? "Listening…" : providerTimed ? "Re-transcribe" : original ? "Regenerate" : "Create subtitles"

  return <div className="detail-body caption-detail">
    {job && <OperationState job={job} title={job.type === "translate" ? "Subtitle translation" : "Create subtitles"} onConfirm={confirmation ? () => void onConfirm() : undefined} onRetry={job.status === "failed" ? () => void onRetryJob() : undefined} onDismiss={!busy && !confirmation ? onDismissJob : undefined} />}
    <section>
      <div className="detail-section-head caption-actions">
        <div><span className="eyebrow">Editorial captions</span><h3>{original ? needsRefresh ? "Captions need review" : "Captions are current" : "No captions yet"}</h3><p>{original ? `${selectedLanguage || "Original captions"} · ${captions.filter((item) => item.is_translation).length} translation${captions.filter((item) => item.is_translation).length === 1 ? "" : "s"}` : "Create timed text from the active recording."}</p></div>
      </div>
      <div className="caption-source-bar"><Languages /><span><b>Spoken language</b><small>{selectedLanguage ? `${selectedLanguage} is saved with the current captions.` : "Auto-detect lets the caption AI identify and save the spoken language."}</small></span><Select value={captionLanguage} onValueChange={setCaptionLanguage} disabled={Boolean(busy)}><SelectTrigger aria-label="Caption source language"><SelectValue /></SelectTrigger><SelectContent>{sourceChoices.map((language) => <SelectItem key={language} value={language}>{language === "Auto" ? "Auto-detect" : language}</SelectItem>)}</SelectContent></Select><Button disabled={Boolean(busy)} onClick={() => void onCreate(captionLanguage === "Auto" ? undefined : captionLanguage)}>{busy === "transcribe" ? <LoaderCircle className="spin" /> : needsRefresh || original ? <RefreshCw /> : <Captions />}{createLabel}</Button></div>
      {needsRefresh && <div className="caption-stale-callout"><CircleAlert /><span><b>Recording changed</b><small>These timed captions remain available as historical work, but must be regenerated before release.</small></span></div>}
      {original && !needsRefresh && <div className="caption-translate-bar"><Languages /><span>Translate subtitles</span><Select value={selectedTarget} onValueChange={setTarget} disabled={!availableLanguages.length}><SelectTrigger aria-label="Translation language"><SelectValue placeholder="Choose language" /></SelectTrigger><SelectContent>{availableLanguages.map((language) => <SelectItem key={language} value={language}>{language}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!selectedTarget || busy === "translate"} onClick={() => void onTranslate(selectedTarget)}>{busy === "translate" ? <LoaderCircle className="spin" /> : <Languages />}{busy === "translate" ? "Translating…" : "Translate"}</Button></div>}
    </section>

    {transcript && <CaptionStylePicker value={profile} layout={layout} busy={layoutBusy} onChange={setProfile} />}

    <div className="caption-workspace">
      <section className="caption-files"><div className="inspector-section-heading"><div><span className="eyebrow">Saved timed text</span><h3>Languages</h3></div><span>{captions.length} file{captions.length === 1 ? "" : "s"}</span></div>{loading ? <p className="detail-loading"><LoaderCircle className="spin" /> Loading captions…</p> : captions.length ? captions.map((item) => <button className={`caption-row${transcript?.id === item.id ? " is-selected" : ""}`} key={item.id} onClick={() => void onSelect(item)}><Captions /><span><b>{item.is_translation ? item.language || "Translation" : originalCaptionLabel(item.language)}</b><small>{item.is_translation ? "Translation" : "Source captions"} · {formatDuration(Number(item.duration_ms || 0) / 1000)}</small></span>{item.stale && <Badge variant="outline" className="caption-stale-badge">Stale</Badge>}</button>) : <p className="detail-empty">No captions yet. Create timed text from the active recording when this Part is ready for editorial review.</p>}</section>

      <section className="caption-preview">{transcript ? <><div className="caption-preview-title"><div><span className="eyebrow">Selected file</span><h3>{selectedSummary?.is_translation ? selectedSummary.language || "Translation" : originalCaptionLabel(transcript.language)}</h3>{providerTimed && <small>Word timing captured during CosyVoice generation · no second transcription call</small>}</div><span>{displayCues.length} cues · {formatDuration(Number(transcript.duration_ms || 0) / 1000)}</span></div><div className="caption-preview-head"><Tabs value={format} onValueChange={(value) => setFormat(value as typeof format)}><TabsList><TabsTrigger value="text">Text</TabsTrigger><TabsTrigger value="srt">SRT</TabsTrigger><TabsTrigger value="vtt">VTT</TabsTrigger><TabsTrigger value="json"><FileJson />JSON</TabsTrigger></TabsList></Tabs><Button variant="outline" onClick={() => downloadText(`${transcript.file.replace(/\.[^.]+$/, "")}.${profile}.${format === "text" ? "txt" : format}`, body)}><Download /> Download</Button></div><pre className={format === "text" ? "is-readable" : "is-code"} dir="auto">{body}</pre></> : <div className="caption-preview-empty"><Captions /><b>Select a caption file</b><p>Read and export the complete timed text here.</p></div>}</section>
    </div>

    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) onCancel() }}><DialogContent><DialogHeader><DialogTitle>{confirmation?.kind === "translate" ? `Translate into ${confirmation.target}?` : "Create subtitles?"}</DialogTitle><DialogDescription>This provider operation is estimated at ${Number(confirmation?.estimate || 0).toFixed(4)}. Actual usage and cost are saved after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={onCancel}>Cancel</Button><Button onClick={() => void onConfirm()}>Continue</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
