import { CircleAlert, Copy, Download, Languages, LoaderCircle, Play } from "lucide-react"
import { toast } from "sonner"

import type { GlobalPlayerValue } from "@/components/global-player-provider"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDuration, formatMoney } from "@/lib/format"
import type { CaptionLayout, CaptionProfile, Transcript } from "@/types/domain"

import { CaptionStylePicker } from "./caption-style-picker"

function downloadText(name: string, body: string) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }))
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function SubtitleResult({ transcript, display, layout, profile, layoutBusy, languages, translationLanguage, translating, player, onPlayAt, onProfileChange, onTranslationLanguage, onTranslate }: {
  transcript: Transcript
  display: CaptionLayout
  layout: CaptionLayout | null
  profile: CaptionProfile
  layoutBusy: boolean
  languages: string[]
  translationLanguage: string
  translating: boolean
  player: GlobalPlayerValue
  onPlayAt: (seconds?: number) => void
  onProfileChange: (profile: CaptionProfile) => void
  onTranslationLanguage: (language: string) => void
  onTranslate: () => void
}) {
  const baseName = (transcript.file || "subtitles").replace(/\.[^.]+$/, "")
  return <section className="subtitles-card transcript-result">
    <header><div><h2>{transcript.file || "Transcript"}</h2><p>{display.cues.length} cues · {formatDuration((transcript.duration_ms || 0) / 1000)}</p></div>{transcript.url && <Button variant="outline" onClick={() => onPlayAt()}><Play /> Play audio</Button>}</header>
    <details className="subtitle-details">
      <summary>Details · cost, model, region and Job</summary>
      <div className="subtitle-accounting">
        <span><b>{formatMoney(transcript.cost || 0)}</b><small>{transcript.cost_basis === "actual_tokens" ? "Actual provider token usage" : transcript.cost_basis === "catalog_duration" ? "Catalogue cost from measured duration" : transcript.cost_basis || "Historical cost basis"}</small></span>
        <span><b>{transcript.model || "Model not recorded"}</b><small>{transcript.provider_region || "Region not recorded"}</small></span>
        <span><b>{transcript.source_job_id ? transcript.source_job_id.slice(0, 8) : "Historical"}</b><small>Job ID</small></span>
      </div>
    </details>
    <CaptionStylePicker value={profile} layout={layout} busy={layoutBusy} onChange={onProfileChange} />
    {profile === "words" && transcript.language?.toLowerCase().startsWith("ar") && <div className="caption-language-note"><CircleAlert />Arabic transcription is supported, but this model does not guarantee word-level timestamps for Arabic. Review this alignment before publishing.</div>}
    <div className="subtitle-translation"><Languages /><div><b>Translate this subtitle file</b><span>The original stays untouched; the translation is saved as another timed version.</span></div><Select value={translationLanguage} onValueChange={onTranslationLanguage}><SelectTrigger aria-label="Translation language"><SelectValue /></SelectTrigger><SelectContent>{languages.filter((item) => item !== transcript.language).map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={translating} onClick={onTranslate}>{translating ? <LoaderCircle className="spin" /> : <Languages />}{translating ? "Translating…" : "Translate"}</Button></div>
    <Tabs defaultValue="lines"><TabsList><TabsTrigger value="lines">Timed cues</TabsTrigger><TabsTrigger value="text">Plain text</TabsTrigger><TabsTrigger value="srt">SRT</TabsTrigger><TabsTrigger value="vtt">VTT</TabsTrigger><TabsTrigger value="json">Timing JSON</TabsTrigger></TabsList>
      <TabsContent value="lines"><div className="cue-list">{display.cues.map((cue, index) => <button key={`${cue.start}-${index}`} className={player.source?.key === `subtitle:${transcript.id}` && player.currentTime * 1000 >= cue.start && player.currentTime * 1000 < cue.end ? "active" : ""} onClick={() => onPlayAt(cue.start / 1000)}><time>{formatDuration(cue.start / 1000)}</time><span dir="auto">{cue.text}</span></button>)}</div></TabsContent>
      {(["text", "srt", "vtt", "json"] as const).map((kind) => {
        const body = kind === "text" ? transcript.text : kind === "json" ? display.timing_json : display[kind]
        return <TabsContent value={kind} key={kind}><pre dir="auto">{body}</pre><div className="subtitle-file-actions"><Button variant="outline" onClick={() => void navigator.clipboard.writeText(body).then(() => toast.success(`${kind.toUpperCase()} copied.`))}><Copy /> Copy</Button><Button variant="outline" onClick={() => downloadText(`${baseName}.${kind === "text" ? "txt" : kind}`, body)}><Download /> Download</Button></div></TabsContent>
      })}
    </Tabs>
  </section>
}
