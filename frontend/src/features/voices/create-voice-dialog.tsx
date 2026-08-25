import { Check, ChevronLeft, ChevronRight, LoaderCircle, Mic2, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import { RecordingLanguageField } from "@/features/voices/recording-language-field"
import { AudioSourceEditor } from "@/features/sound-scene/source-editor/music-source-editor"
import { studioApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { StudioConfig, VoicePackagePlan } from "@/types/domain"

const steps = ["Identity", "Recording", "Review"] as const

export function CreateVoiceDialog({ open, onOpenChange, config, onQueued }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: StudioConfig | null
  onQueued: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [gender, setGender] = useState<"" | "female" | "male">("")
  const [recordingLanguage, setRecordingLanguage] = useState("")
  const [editorialLanguage, setEditorialLanguage] = useState("none")
  const [trait, setTrait] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [referenceId, setReferenceId] = useState("")
  const [referenceDurationMs, setReferenceDurationMs] = useState<number | null>(null)
  const [referenceWindowId, setReferenceWindowId] = useState("")
  const [sourceOffsetMs, setSourceOffsetMs] = useState(0)
  const [sourceDurationMs, setSourceDurationMs] = useState(20_000)
  const [sourceTranscript, setSourceTranscript] = useState("")
  const [plan, setPlan] = useState<VoicePackagePlan | null>(null)
  const [busy, setBusy] = useState<"upload" | "plan" | "create" | null>(null)
  const [error, setError] = useState("")
  const languages = useMemo(() => {
    const map = new Map<string, string>()
    Object.values(config?.capabilities || {}).forEach((capability) => Object.entries(capability.clone_languages || {}).forEach(([code, label]) => map.set(code, label)))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [config])

  useEffect(() => {
    if (!open) return
    setStep(0); setName(""); setGender(""); setRecordingLanguage(""); setEditorialLanguage("none"); setTrait(""); setFile(null); setReferenceId(""); setReferenceDurationMs(null); setReferenceWindowId(""); setSourceOffsetMs(0); setSourceDurationMs(20_000); setSourceTranscript(""); setPlan(null); setBusy(null); setError("")
  }, [open])

  async function prepareRecording() {
    if (!file) return
    setBusy("upload"); setError("")
    try { const result = await studioApi.uploadVoiceReference(file); setReferenceId(result.reference_id); setReferenceDurationMs(result.duration_ms); setSourceOffsetMs(0); setSourceDurationMs(Math.min(result.duration_ms, 20_000)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The recording could not be uploaded.") }
    finally { setBusy(null) }
  }
  async function saveSelectionAndContinue() {
    if (!referenceId) return
    setBusy("upload"); setError("")
    try {
      const window = await studioApi.saveUploadedVoiceReferenceWindow(referenceId, { provider_model_id: null, start_ms: sourceOffsetMs, duration_ms: sourceDurationMs, source_language: recordingLanguage, transcript: sourceTranscript, enable_preprocess: null })
      setReferenceWindowId(window.id); setStep(2)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The selected source window could not be saved.") }
    finally { setBusy(null) }
  }
  useEffect(() => {
    if (!open || step !== 2) return
    setBusy("plan"); setError("")
    void studioApi.voicePackagePreflight(recordingLanguage, "complete").then(setPlan).catch((reason) => setError(reason instanceof Error ? reason.message : "Installed clone methods could not be checked.")).finally(() => setBusy(null))
  }, [recordingLanguage, open, step])

  async function create() {
    if (!referenceId || !plan?.routes.length) return
    setBusy("create"); setError("")
    try {
      const result = await studioApi.createVoicePackage({ name: name.trim(), gender, language: recordingLanguage.trim(), editorial_language: editorialLanguage === "none" ? "" : editorialLanguage, reference_id: referenceId, reference_window_id: referenceWindowId || undefined, package: "complete", trait: trait.trim(), confirmed: true })
      onOpenChange(false); onQueued(); toast.success(`${name.trim()} added`, { description: `${result.queued} voice versions are being created.` })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The voice package could not be started.") }
    finally { setBusy(null) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}><DialogContent className="voice-create-dialog">
    <DialogHeader><DialogTitle>Create a production voice</DialogTitle><DialogDescription>One human voice, with every installed cloned-model version your Studio can use.</DialogDescription></DialogHeader>
    <nav className="voice-create-steps" aria-label="Voice creation steps">{steps.map((label, index) => <span key={label} className={cn(index === step && "active", index < step && "done")}><i>{index < step ? <Check /> : index + 1}</i>{label}</span>)}</nav>
    <div className="voice-create-stage">
      {step === 0 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Who is this voice?</h3><p>The name belongs to the person or character. Provider model IDs stay underneath it.</p></div><label><span>Voice name</span><Input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} placeholder="e.g. Serinity" /></label><div className="voice-create-sex"><span>Sex</span><ToggleGroup type="single" variant="outline" value={gender} onValueChange={(value) => { if (value === "female" || value === "male") setGender(value) }} aria-label="Voice sex"><ToggleGroupItem value="female" aria-label="Female voice"><VoiceGenderBadge gender="female" /></ToggleGroupItem><ToggleGroupItem value="male" aria-label="Male voice"><VoiceGenderBadge gender="male" /></ToggleGroupItem></ToggleGroup><small>Shown consistently anywhere this voice is selected or used.</small></div><label><span>Team language tag <small>optional</small></span><Select value={editorialLanguage} onValueChange={setEditorialLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No language focus</SelectItem>{languages.map(([code, label]) => <SelectItem value={code} key={code}>{label}</SelectItem>)}</SelectContent></Select><small>A casting label and flag for your team. It never limits what the voice can say.</small></label><RecordingLanguageField value={recordingLanguage} onChange={setRecordingLanguage} suggestions={languages} /><label><span>Voice notes <small>optional</small></span><Textarea value={trait} maxLength={240} onChange={(event) => setTrait(event.target.value)} placeholder="Warm, intimate storyteller with a calm pace" /></label></section>}
      {step === 1 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Add a clean Voice Source</h3><p>Keep the full master, then choose the strongest continuous 10–20 seconds for cloning. Each model can receive its own window later.</p></div>{!referenceId ? <><FileDropZone file={file} accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" disabled={Boolean(busy)} onFile={(next) => { setFile(next); setReferenceId(""); setReferenceDurationMs(null); setError("") }} hint="WAV, MP3 or M4A · 5 seconds–10 minutes · up to 100 MB" /><div className="voice-recording-guidance"><span><Check /> One speaker</span><span><Check /> Clear, dry audio</span><span><Check /> Natural expression</span></div></> : <div className="voice-create-source-editor"><AudioSourceEditor url={`/api/v1/voice-references/${encodeURIComponent(referenceId)}/audio`} peaksUrl={`/api/v1/voice-references/${encodeURIComponent(referenceId)}/peaks`} sourceDuration={(referenceDurationMs || 0) / 1000} sourceOffset={sourceOffsetMs / 1000} usedDuration={sourceDurationMs / 1000} loop={false} onChange={(window) => { setSourceOffsetMs(window.sourceOffsetMs); setSourceDurationMs(window.durationMs || sourceDurationMs) }} onCommit={(window) => { setSourceOffsetMs(window.sourceOffsetMs); setSourceDurationMs(window.durationMs || sourceDurationMs) }} /><label><span>Exact words in this selection</span><Textarea value={sourceTranscript} onChange={(event) => setSourceTranscript(event.target.value)} placeholder="Required by the installed Qwen3 TTS Voice Clone method" /></label></div>}</section>}
      {step === 2 && <section><span className="voice-create-symbol"><Sparkles /></span><div className="voice-create-heading"><h3>Review the installed clone methods</h3><p>One confirmation creates {name.trim()} and attempts every installed method with this {referenceDurationMs ? `${(referenceDurationMs / 1000).toFixed(1)}-second ` : ""}recording. “{recordingLanguage.trim()}” is provenance only; it never restricts the Voice Identity.</p></div>{busy === "plan" && <div className="voice-plan-loading"><LoaderCircle className="spin" /> Checking installed models…</div>}{plan && <div className="voice-plan-summary"><header><b>{plan.routes.length} installed versions will be attempted</b><span>{plan.region_label}</span></header>{plan.routes.map((route) => <div key={route.provider_model_id}><span><b>{route.role}</b><small>{route.provider} · {route.label} · {route.region} · {route.source_language_documented ? "Documented source language" : "Experimental source language · still selectable"} · {route.documented_output_languages.length} documented output languages</small></span><em>{route.estimated_creation_cost ? `up to $${route.estimated_creation_cost.toFixed(2)}` : "Free creation"}</em></div>)}</div>}
      </section>}
      {error && <p className="voice-create-error">{error}</p>}
    </div>
      <DialogFooter><Button type="button" variant="ghost" disabled={Boolean(busy) || step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft /> Back</Button><span className="voice-create-spacer" />{step === 0 && <Button type="button" disabled={!name.trim() || !gender || !recordingLanguage.trim()} onClick={() => setStep(1)}>Continue <ChevronRight /></Button>}{step === 1 && !referenceId && <Button type="button" disabled={!file || Boolean(busy)} onClick={() => void prepareRecording()}>{busy === "upload" ? <><LoaderCircle className="spin" /> Preparing source…</> : <>Choose source window <ChevronRight /></>}</Button>}{step === 1 && referenceId && <Button type="button" disabled={Boolean(busy) || sourceDurationMs < 1_000 || !sourceTranscript.trim()} onClick={() => void saveSelectionAndContinue()}>{busy === "upload" ? <><LoaderCircle className="spin" /> Saving selection…</> : <>Review methods <ChevronRight /></>}</Button>}{step === 2 && <Button type="button" disabled={!plan?.routes.length || Boolean(busy)} onClick={() => void create()}>{busy === "create" ? <><LoaderCircle className="spin" /> Starting…</> : <>Create voice <Sparkles /></>}</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
