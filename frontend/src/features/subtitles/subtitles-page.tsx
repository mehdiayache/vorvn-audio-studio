import { Captions, CircleAlert, Copy, Download, FileAudio, Languages, LoaderCircle, Play, RotateCw, Trash2, Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { studioApi } from "@/lib/api"
import { formatDuration, formatMoney } from "@/lib/format"
import type { CaptionLayout, CaptionProfile, ExternalAudioUpload, ExternalTranscriptSummary, Transcript } from "@/types/domain"

import { CaptionStylePicker } from "./caption-style-picker"
import "./subtitles-page.css"

const fallbackLanguages = ["English", "Arabic", "French", "Spanish", "German", "Indonesian", "Chinese", "Japanese", "Korean"]

function downloadText(name: string, body: string) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }))
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function SubtitlesPage() {
  const [history, setHistory] = useState<ExternalTranscriptSummary[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState("Auto")
  const [languages, setLanguages] = useState(fallbackLanguages)
  const [enableItn, setEnableItn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [pending, setPending] = useState<{ uploaded: ExternalAudioUpload; estimate: number } | null>(null)
  const [uploaded, setUploaded] = useState<ExternalAudioUpload | null>(null)
  const [translationLanguage, setTranslationLanguage] = useState("Arabic")
  const [translationPending, setTranslationPending] = useState<{ target: string; estimate: number } | null>(null)
  const [translating, setTranslating] = useState(false)
  const [profile, setProfile] = useState<CaptionProfile>("standard")
  const [layout, setLayout] = useState<CaptionLayout | null>(null)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const player = useGlobalPlayer()

  const refresh = async () => setHistory(await studioApi.externalTranscripts())
  useEffect(() => {
    void refresh().catch(() => setHistory([]))
    void studioApi.config().then((config) => setLanguages(
      (config.languages.length ? config.languages : fallbackLanguages).filter((item) => item !== "Auto"),
    )).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!transcript?.id) { setLayout(null); return }
    let current = true
    setLayoutBusy(true)
    void studioApi.subtitleLayout(transcript.id, profile)
      .then((next) => { if (current) setLayout(next) })
      .catch((reason) => { if (current) toast.error(reason instanceof Error ? reason.message : "Caption layout could not be prepared.") })
      .finally(() => { if (current) setLayoutBusy(false) })
    return () => { current = false }
  }, [profile, transcript?.id])

  const openTranscript = async (id: number) => {
    try {
      const next = await studioApi.externalTranscript(id)
      player.pause()
      setTranscript(next)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Subtitles could not be opened.") }
  }

  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get("transcript") || 0)
    if (requested > 0) void openTranscript(requested)
  }, [])

  const transcribe = async (uploaded: ExternalAudioUpload, confirmed = false) => {
    setBusy(true)
    setError("")
    try {
      const result = await studioApi.transcribeExternal({ ...uploaded, language: language === "Auto" ? "" : language, enable_itn: enableItn, confirmed })
      if (result.needs_confirmation) { setPending({ uploaded, estimate: result.estimate || 0 }); return }
      setTranscript(result)
      setFile(null)
      setUploaded(null)
      await refresh()
      toast.success(`${result.sentences.length} subtitle lines ready.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Transcription failed."
      setError(message)
      toast.error(message)
    }
    finally { setBusy(false) }
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError("")
    try {
      const source = uploaded || await studioApi.uploadExternalAudio(file)
      setUploaded(source)
      await transcribe(source)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Upload failed."
      setError(message); toast.error(message); setBusy(false)
    }
  }

  const translate = async (confirmed = false, target = translationLanguage) => {
    if (!transcript?.id || !target) return
    setTranslating(true); setError("")
    try {
      const result = await studioApi.translateTranscript(transcript.id, target, confirmed)
      if (result.needs_confirmation) {
        setTranslationPending({ target, estimate: result.estimate || 0 })
        return
      }
      setTranscript(result); await refresh()
      toast.success(`${target} subtitles ready.`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Translation failed."
      setError(message); toast.error(message)
    } finally { setTranslating(false) }
  }

  const baseName = useMemo(() => (transcript?.file || "subtitles").replace(/\.[^.]+$/, ""), [transcript])
  const display = layout || (transcript ? { cues: transcript.sentences.map((sentence) => ({ ...sentence, end: sentence.end || sentence.start, words: sentence.words || [], timing: "estimated" as const })), srt: transcript.srt, vtt: transcript.vtt, timing_json: "", metrics: { cues: transcript.sentences.length, average_words: 0, maximum_cps: 0 }, timing_quality: "estimated" as const, profile: { key: profile, label: "", description: "", max_words: 0, max_chars: 0, line_chars: 0, max_lines: 0, min_duration_ms: 0, max_duration_ms: 0 } } : null)

  const playAt = async (seconds = 0) => {
    if (!transcript?.url) return
    const key = `subtitle:${transcript.id}`
    if (player.source?.key !== key) await player.toggleSource({ key, url: transcript.url, title: transcript.file, subtitle: "Subtitle source", kind: "subtitle" })
    else if (player.state !== "playing") await player.toggle()
    player.seek(seconds)
  }

  return <main className="subtitles-page">
    <header className="subtitles-hero"><span><Captions /></span><div><small>Standalone tool</small><h1>Subtitles</h1><p>Transcribe external audio. Audio made inside a Production keeps its subtitles with that Part.</p></div></header>
    <div className="subtitles-layout">
      <div className="subtitles-main">
        <section className="subtitles-card"><header><div><h2>External audio</h2><p>MP3, WAV, M4A, AAC, OGG or FLAC · maximum 500 MB.</p></div></header><FileDropZone file={file} accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" disabled={busy} onFile={(next) => { setFile(next); setUploaded(null); setError("") }} hint="or choose a file" emptyLabel="Drop audio here" /><div className="subtitles-form"><label><span>Spoken language</span><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Auto">Auto</SelectItem>{languages.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select></label><label className="subtitle-itn"><Checkbox checked={enableItn} onCheckedChange={(value) => setEnableItn(value === true)} /><span><b>Format numbers and dates</b><small>For example, “twenty twenty-six” may become “2026”.</small></span></label><Button disabled={!file || busy} onClick={() => void upload()}>{busy ? <LoaderCircle className="spin" /> : error && uploaded ? <RotateCw /> : <Upload />}{busy ? "Listening…" : error && uploaded ? "Retry subtitles" : "Create subtitles"}</Button></div><p className="recognition-note">Word timings are always saved when Alibaba provides them. Caption styles can be changed later without paying again.</p>{error && <div className="subtitles-inline-error" role="alert"><CircleAlert /><div><b>Subtitles were not created</b><span>{error}</span>{uploaded && <small>Your upload is preserved. Retry does not upload the file again.</small>}</div></div>}</section>
        {transcript && display && <section className="subtitles-card transcript-result"><header><div><h2>{transcript.file || "Transcript"}</h2><p>{display.cues.length} cues · {formatDuration((transcript.duration_ms || 0) / 1000)}</p></div>{transcript.url && <Button variant="outline" onClick={() => void playAt()}><Play /> Play audio</Button>}</header><div className="subtitle-accounting"><span><b>{formatMoney(transcript.cost || 0)}</b><small>{transcript.cost_basis === "actual_tokens" ? "Actual Alibaba token usage" : transcript.cost_basis === "catalog_duration" ? "Catalogue cost from measured duration" : transcript.cost_basis || "Historical cost basis"}</small></span><span><b>{transcript.model || "Model not recorded"}</b><small>{transcript.provider_region || "Region not recorded"}</small></span><span><b>{transcript.source_job_id ? transcript.source_job_id.slice(0, 8) : "Historical"}</b><small>Job ID</small></span></div><CaptionStylePicker value={profile} layout={layout} busy={layoutBusy} onChange={setProfile} />{profile === "words" && transcript.language?.toLowerCase().startsWith("ar") && <div className="caption-language-note"><CircleAlert />Arabic transcription is supported, but Alibaba does not guarantee word-level timestamps for Arabic. Review this alignment before publishing.</div>}<div className="subtitle-translation"><Languages /><div><b>Translate this subtitle file</b><span>The original stays untouched; the translation is saved as another timed version.</span></div><Select value={translationLanguage} onValueChange={setTranslationLanguage}><SelectTrigger aria-label="Translation language"><SelectValue /></SelectTrigger><SelectContent>{languages.filter((item) => item !== transcript.language).map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={translating} onClick={() => void translate()}>{translating ? <LoaderCircle className="spin" /> : <Languages />}{translating ? "Translating…" : "Translate"}</Button></div><Tabs defaultValue="lines"><TabsList><TabsTrigger value="lines">Timed cues</TabsTrigger><TabsTrigger value="text">Plain text</TabsTrigger><TabsTrigger value="srt">SRT</TabsTrigger><TabsTrigger value="vtt">VTT</TabsTrigger><TabsTrigger value="json">Timing JSON</TabsTrigger></TabsList><TabsContent value="lines"><div className="cue-list">{display.cues.map((cue, index) => <button key={`${cue.start}-${index}`} className={player.source?.key === `subtitle:${transcript.id}` && player.currentTime * 1000 >= cue.start && player.currentTime * 1000 < cue.end ? "active" : ""} onClick={() => void playAt(cue.start / 1000)}><time>{formatDuration(cue.start / 1000)}</time><span dir="auto">{cue.text}</span></button>)}</div></TabsContent>{(["text", "srt", "vtt", "json"] as const).map((kind) => { const body = kind === "text" ? transcript.text : kind === "json" ? display.timing_json : display[kind]; return <TabsContent value={kind} key={kind}><pre dir="auto">{body}</pre><div className="subtitle-file-actions"><Button variant="outline" onClick={() => void navigator.clipboard.writeText(body).then(() => toast.success(`${kind.toUpperCase()} copied.`))}><Copy /> Copy</Button><Button variant="outline" onClick={() => downloadText(`${baseName}.${kind === "text" ? "txt" : kind}`, body)}><Download /> Download</Button></div></TabsContent> })}</Tabs></section>}
      </div>
      <aside className="subtitles-history"><h2>Previous subtitles</h2>{history.length ? history.map((item) => <article key={item.id}><button onClick={() => void openTranscript(item.id)}><FileAudio /><span><b>{item.name}</b><small>{item.when} · {item.lines} lines · {formatMoney(item.cost || 0)}</small><small>{item.model || "Historical model"}</small></span></button><Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} onClick={async () => { await studioApi.deleteExternalTranscript(item.id); if (transcript?.id === item.id) setTranscript(null); await refresh() }}><Trash2 /></Button></article>) : <p>No external subtitles yet.</p>}</aside>
    </div>
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) setPending(null) }}><DialogContent><DialogHeader><DialogTitle>Create these subtitles?</DialogTitle><DialogDescription>Alibaba transcription is estimated at ${Number(pending?.estimate || 0).toFixed(4)}.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPending(null)}>Cancel</Button><Button onClick={() => { const next = pending?.uploaded; setPending(null); if (next) void transcribe(next, true) }}>Continue</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(translationPending)} onOpenChange={(open) => { if (!open) setTranslationPending(null) }}><DialogContent><DialogHeader><DialogTitle>Translate these subtitles?</DialogTitle><DialogDescription>This Qwen-MT request is estimated at ${Number(translationPending?.estimate || 0).toFixed(4)}. Actual input and output token usage will be stored after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setTranslationPending(null)}>Cancel</Button><Button onClick={() => { const next = translationPending; setTranslationPending(null); if (next) void translate(true, next.target) }}>Continue</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
