import { CircleAlert, LoaderCircle, RotateCw, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperationState } from "@/components/operation-state"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StudioPageHeader } from "@/components/studio-page-header"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useJobQuery } from "@/hooks/use-job-query"
import { useWorkspaceExplorer } from "@/hooks/use-workspace-explorer"
import { originsApi } from "@/lib/api"
import { buildCaptionPlayerTrack, useCaptionPresentation } from "@/lib/caption-presentation"
import type { CaptionLayout, CaptionMutationResult, CaptionProfile, ExternalAudioUpload, ExternalTranscriptSummary, Transcript } from "@/types/domain"
import { CreatorCapabilityBody, CreatorCapabilityFooter, CreatorCapabilityPanel } from "../panel/creator-capability-panel"

import { SubtitleHistory } from "./subtitle-history"
import { SubtitleResult } from "./subtitle-result"
import "./subtitle-creator-page.css"

const fallbackLanguages = ["English", "Arabic", "French", "Spanish", "German", "Indonesian", "Chinese", "Japanese", "Korean"]
const transcriptionEngines = [{ id: "alibaba:qwen3-asr-flash-filetrans", provider: "Alibaba", model: "Qwen3 ASR Flash" }] as const

function fallbackLayout(transcript: Transcript, profile: CaptionProfile): CaptionLayout {
  return {
    cues: transcript.sentences.map((sentence) => ({ ...sentence, end: sentence.end || sentence.start, words: sentence.words || [], timing: "estimated" as const })),
    srt: transcript.srt, vtt: transcript.vtt, timing_json: "",
    metrics: { cues: transcript.sentences.length, average_words: 0, maximum_cps: 0 },
    timing_quality: "estimated",
    profile: { key: profile, label: "", description: "", max_words: 0, max_chars: 0, line_chars: 0, max_lines: 0, min_duration_ms: 0, max_duration_ms: 0 },
  }
}

export function SubtitleCreatorPage({ embedded = false, panelOnly = false, onLibraryChange, onCreatedFiles }: { embedded?: boolean; panelOnly?: boolean; onLibraryChange?: () => void | Promise<void>; onCreatedFiles?: (fileIds: number[]) => void | Promise<void> } = {}) {
  const player = useGlobalPlayer()
  const workspaceHome = useWorkspaceExplorer()
  const [jobId, setJobId] = useJobQuery("subtitle-job")
  const job = useJobExecution<CaptionMutationResult>(jobId)
  const terminalJob = useRef<string | null>(null)
  const [history, setHistory] = useState<ExternalTranscriptSummary[]>([])
  const [historyError, setHistoryError] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [uploaded, setUploaded] = useState<ExternalAudioUpload | null>(null)
  const [uploading, setUploading] = useState(false)
  const [language, setLanguage] = useState("Auto")
  const [transcriptionEngine, setTranscriptionEngine] = useState<string>(transcriptionEngines[0].id)
  const [languages, setLanguages] = useState(fallbackLanguages)
  const [enableItn, setEnableItn] = useState(false)
  const [error, setError] = useState("")
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [translationLanguage, setTranslationLanguage] = useState("Arabic")
  const [profile, setProfile] = useCaptionPresentation()
  const [layout, setLayout] = useState<CaptionLayout | null>(null)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const active = Boolean(job && ["queued", "running", "retrying"].includes(job.status))
  const translating = active && job?.type === "translate"
  const confirmation = job?.status === "blocked" && job.result?.needs_confirmation && !Boolean((job.result as CaptionMutationResult & { requires_review?: boolean })?.requires_review) ? job : null

  async function refresh() {
    if (!workspaceHome.selectedWorkspaceId) return
    try { setHistory(await originsApi.externalTranscripts(workspaceHome.selectedWorkspaceId)); setHistoryError("") }
    catch (reason) { setHistoryError(reason instanceof Error ? reason.message : "Previous subtitles are unavailable.") }
  }

  async function openTranscript(id: number) {
    try {
      const next = await originsApi.externalTranscript(id)
      if (next.workspace_id !== workspaceHome.selectedWorkspaceId) throw new Error("These subtitles belong to another Workspace.")
      player.pause()
      setTranscript(next)
    }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Subtitles could not be opened.") }
  }

  useEffect(() => {
    if (!workspaceHome.selectedWorkspaceId) return
    setHistory([])
    setTranscript(null)
    setFile(null)
    setUploaded(null)
    setJobId(null)
    void refresh()
    void originsApi.config().then((config) => setLanguages((config.languages.length ? config.languages : fallbackLanguages).filter((item) => item !== "Auto"))).catch(() => undefined)
    const requested = Number(new URLSearchParams(window.location.search).get("transcript") || 0)
    if (requested > 0) void openTranscript(requested)
  }, [workspaceHome.selectedWorkspaceId])

  useEffect(() => {
    if (!transcript?.id) { setLayout(null); return }
    let current = true
    setLayoutBusy(true)
    void originsApi.subtitleLayout(transcript.id, profile).then((next) => { if (current) setLayout(next) }).catch((reason) => { if (current) toast.error(reason instanceof Error ? reason.message : "Caption layout could not be prepared.") }).finally(() => { if (current) setLayoutBusy(false) })
    return () => { current = false }
  }, [profile, transcript?.id])

  useEffect(() => {
    if (!job || terminalJob.current === job.id || !["ok", "warning", "failed", "lost", "cancelled"].includes(job.status)) return
    terminalJob.current = job.id
    if ((job.status === "ok" || job.status === "warning") && job.result?.id) {
      setTranscript(job.result); setFile(null); setUploaded(null); void refresh(); void onLibraryChange?.()
      const fileIds = job.output_file_ids || ((job.result as CaptionMutationResult & { output_file_ids?: number[] }).output_file_ids ?? [])
      if (fileIds.length) void Promise.resolve(onCreatedFiles?.(fileIds)).catch((reason) => toast.error("The subtitles are safe in Workspace Files, but the current Library did not refresh.", { description: reason instanceof Error ? reason.message : undefined }))
      toast.success(job.type === "translate" ? "Translated subtitles ready." : `${job.result.sentences.length} subtitle lines ready.`)
    } else if (["failed", "lost", "cancelled"].includes(job.status)) setError(job.error || "The subtitle operation did not finish.")
  }, [job, onCreatedFiles, onLibraryChange])

  async function enqueueTranscription(source: ExternalAudioUpload) {
    if (!workspaceHome.selectedWorkspaceId) return
    setError("")
    try { const next = await originsApi.enqueueExternalTranscription({ ...source, workspace_id: workspaceHome.selectedWorkspaceId, language: language === "Auto" ? "" : language, enable_itn: enableItn }); setJobId(next.id, false) }
    catch (reason) { const message = reason instanceof Error ? reason.message : "Transcription failed."; setError(message); toast.error(message) }
  }

  async function upload() {
    if (!file) return
    setUploading(true); setError("")
    try { const source = uploaded || await originsApi.uploadExternalAudio(file); setUploaded(source); await enqueueTranscription(source) }
    catch (reason) { const message = reason instanceof Error ? reason.message : "Upload failed."; setError(message); toast.error(message) }
    finally { setUploading(false) }
  }

  async function translate() {
    if (!transcript?.id || !translationLanguage) return
    setError("")
    try { const next = await originsApi.enqueueTranscriptTranslation(transcript.id, translationLanguage); setJobId(next.id, false) }
    catch (reason) { const message = reason instanceof Error ? reason.message : "Translation failed."; setError(message); toast.error(message) }
  }

  async function confirmJob() {
    if (!job) return
    try { const next = await originsApi.confirmJob<CaptionMutationResult>(job.id); setJobId(next.id, false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Confirmation failed.") }
  }

  async function playAt(seconds = 0) {
    if (!transcript?.url) return
    const key = `subtitle:${transcript.id}`
    if (player.source?.key !== key) {
      const languageLabel = String(transcript.language || "").trim() || "Original captions"
      const captionTrack = await buildCaptionPlayerTrack({ transcript, language: languageLabel, label: languageLabel })
      await player.toggleSource({ key, url: transcript.url, title: transcript.file, subtitle: "Subtitle source", kind: "subtitle", captionTracks: [captionTrack] })
    }
    else if (player.state !== "playing") await player.toggle()
    player.seek(seconds)
  }

  const display = transcript ? layout || fallbackLayout(transcript, profile) : null
  if (workspaceHome.workspaces.status === "loading") return <main className="subtitle-creator-page"><PageLoading label="Opening Subtitles" /></main>
  if (!workspaceHome.selectedWorkspaceId) return <main className="subtitle-creator-page"><ErrorState title="Choose a Workspace first" message="Subtitle Files need a destination Workspace." retry={() => window.location.assign("/origins/")} /></main>
  if (workspaceHome.overview.status === "error" && !workspaceHome.overview.data) return <main className="subtitle-creator-page"><ErrorState title="Workspace unavailable" message={workspaceHome.overview.error || "This Workspace could not be loaded."} retry={() => void workspaceHome.refresh()} /></main>
  const workspaceName = workspaceHome.overview.data?.workspace.name || workspaceHome.workspaces.data?.find((workspace) => workspace.id === workspaceHome.selectedWorkspaceId)?.name || "Current Workspace"
  const Root = embedded ? "div" : "main"
  const primaryAction = <Button disabled={!file || uploading || active} onClick={() => void upload()}>{uploading || (active && job?.type === "transcribe") ? <LoaderCircle className="spin" /> : error && uploaded ? <RotateCw /> : <Upload />}{uploading ? "Uploading…" : active && job?.type === "transcribe" ? "Creating subtitles…" : error && uploaded ? "Retry subtitles" : "Create subtitles"}</Button>
  const content = <div className={`subtitles-layout${panelOnly ? " is-panel-only" : ""}`}><div className="subtitles-main">
    <section className="subtitles-card"><header><div><h2>External audio</h2><p>MP3, WAV, M4A, AAC, OGG or FLAC · maximum 500 MB.</p></div></header><div className="subtitle-engine-field"><span>Engine & model</span><Select value={transcriptionEngine} onValueChange={setTranscriptionEngine}><SelectTrigger aria-label="Subtitle engine and model"><SelectValue /></SelectTrigger><SelectContent>{transcriptionEngines.map((engine) => <SelectItem value={engine.id} key={engine.id}>{engine.provider} · {engine.model}</SelectItem>)}</SelectContent></Select><small>Qwen3 ASR Flash transcribes uploaded audio and preserves word timings when available.</small></div><FileDropZone file={file} accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" disabled={uploading || active} onFile={(next) => { setFile(next); setUploaded(null); setError(""); setJobId(null) }} hint="or choose a file" emptyLabel="Drop audio here" /><div className="subtitles-form"><label><span>Spoken language</span><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Auto">Auto</SelectItem>{languages.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select></label><label className="subtitle-itn"><Checkbox checked={enableItn} onCheckedChange={(value) => setEnableItn(value === true)} /><span><b>Format numbers and dates</b><small>For example, “twenty twenty-six” may become “2026”.</small></span></label>{!panelOnly && primaryAction}</div><p className="recognition-note">Word timings are saved whenever the provider supplies them. Caption styles can be changed later without paying again.</p>{error && <div className="subtitles-inline-error" role="alert"><CircleAlert /><div><b>Subtitles were not created</b><span>{error}</span>{uploaded && <small>Your upload is preserved. Retry does not upload the file again.</small>}</div></div>}</section>
    {job && <OperationState job={job} title={job.type === "translate" ? "Subtitle translation" : "Audio transcription"} onConfirm={confirmation ? () => void confirmJob() : undefined} onRetry={job.status === "failed" && uploaded && job.type === "transcribe" ? () => void enqueueTranscription(uploaded) : undefined} onDismiss={!active ? () => setJobId(null) : undefined} />}
    {transcript && display && <SubtitleResult transcript={transcript} display={display} layout={layout} profile={profile} layoutBusy={layoutBusy} languages={languages} translationLanguage={translationLanguage} translating={translating} player={player} onPlayAt={(seconds) => void playAt(seconds)} onProfileChange={setProfile} onTranslationLanguage={setTranslationLanguage} onTranslate={() => void translate()} />}
  </div>{!panelOnly && <SubtitleHistory history={history} error={historyError} onOpen={(id) => void openTranscript(id)} onDelete={(item) => originsApi.deleteExternalTranscript(item.id).then(() => { if (transcript?.id === item.id) setTranscript(null); return refresh() })} />}</div>
  return <Root className="subtitle-creator-page" data-embedded={embedded || undefined}>
    {!embedded && <StudioPageHeader eyebrow={`Saving to ${workspaceName}`} title="Subtitles" description="Transcribe external audio into reusable subtitle Files. Project audio keeps its subtitles with that Project." />}
    {panelOnly ? <CreatorCapabilityPanel><CreatorCapabilityBody className="subtitle-creator-panel-body">{content}</CreatorCapabilityBody><CreatorCapabilityFooter className="subtitle-creator-panel-footer">{primaryAction}</CreatorCapabilityFooter></CreatorCapabilityPanel> : content}
    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setJobId(null) }}><DialogContent><DialogHeader><DialogTitle>{job?.type === "translate" ? "Translate these subtitles?" : "Create these subtitles?"}</DialogTitle><DialogDescription>This provider request is estimated at ${Number(confirmation?.result?.estimate || 0).toFixed(4)}. The blocked Job remains in Activity if you decide not to continue.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setJobId(null)}>Cancel</Button><Button onClick={() => void confirmJob()}>Confirm and continue</Button></DialogFooter></DialogContent></Dialog>
  </Root>
}
