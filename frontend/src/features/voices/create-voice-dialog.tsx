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
import { studioApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { StudioConfig, VoicePackagePlan } from "@/types/domain"
import { VoiceMethodSourceEditor, routeSourceGuidance, type VoiceSourceDraft } from "./voice-method-source-editor"

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
  const [plan, setPlan] = useState<VoicePackagePlan | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState("")
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, VoiceSourceDraft>>({})
  const [referenceWindowIds, setReferenceWindowIds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<"upload" | "plan" | "create" | null>(null)
  const [error, setError] = useState("")
  const languages = useMemo(() => {
    const map = new Map<string, string>()
    Object.values(config?.capabilities || {}).forEach((capability) => Object.entries(capability.clone_languages || {}).forEach(([code, label]) => map.set(code, label)))
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [config])

  useEffect(() => {
    if (!open) return
    setStep(0); setName(""); setGender(""); setRecordingLanguage(""); setEditorialLanguage("none"); setTrait(""); setFile(null); setReferenceId(""); setReferenceDurationMs(null); setPlan(null); setSelectedRouteId(""); setSourceDrafts({}); setReferenceWindowIds({}); setBusy(null); setError("")
  }, [open])

  async function prepareRecording() {
    if (!file) return
    setBusy("upload"); setError("")
    try {
      const [result, methodPlan] = await Promise.all([
        studioApi.uploadVoiceReference(file),
        studioApi.voicePackagePreflight(recordingLanguage, "complete"),
      ])
      const drafts = Object.fromEntries(methodPlan.routes.map((route) => {
        const guidance = routeSourceGuidance(route)
        return [route.provider_model_id, {
          startMs: 0,
          durationMs: Math.min(result.duration_ms, guidance.recommendedMaximumMs, guidance.maximumMs),
          transcript: "",
          preprocess: false,
        } satisfies VoiceSourceDraft]
      }))
      setReferenceId(result.reference_id)
      setReferenceDurationMs(result.duration_ms)
      setPlan(methodPlan)
      setSourceDrafts(drafts)
      setSelectedRouteId(methodPlan.routes[0]?.provider_model_id || "")
      if (!methodPlan.routes.length) setError("No recording method is currently available for this language.")
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The recording could not be uploaded.") }
    finally { setBusy(null) }
  }
  async function saveMethodSelection() {
    const route = plan?.routes.find((item) => item.provider_model_id === selectedRouteId)
    const draft = sourceDrafts[selectedRouteId]
    if (!referenceId || !route || !draft) return
    const guidance = routeSourceGuidance(route)
    if (draft.durationMs < guidance.minimumMs || draft.durationMs > guidance.maximumMs) {
      setError(`${route.label} needs a source between ${guidance.minimumMs / 1000} and ${guidance.maximumMs / 1000} seconds.`)
      return
    }
    setBusy("upload"); setError("")
    try {
      const window = await studioApi.saveUploadedVoiceReferenceWindow(referenceId, {
        provider_model_id: route.provider_model_id,
        start_ms: draft.startMs,
        duration_ms: draft.durationMs,
        source_language: recordingLanguage,
        transcript: draft.transcript,
        enable_preprocess: route.adapter_key === "audio" ? draft.preprocess : null,
      })
      const nextWindowIds = { ...referenceWindowIds, [route.provider_model_id]: window.id }
      setReferenceWindowIds(nextWindowIds)
      const nextRoute = plan?.routes.find((item) => !nextWindowIds[item.provider_model_id])
      if (nextRoute) setSelectedRouteId(nextRoute.provider_model_id)
      else setStep(2)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The selected source window could not be saved.") }
    finally { setBusy(null) }
  }

  async function create() {
    if (!referenceId || !plan?.routes.length) return
    setBusy("create"); setError("")
    try {
      const result = await studioApi.createVoicePackage({ name: name.trim(), gender, language: recordingLanguage.trim(), editorial_language: editorialLanguage === "none" ? "" : editorialLanguage, reference_id: referenceId, reference_window_ids: referenceWindowIds, package: "complete", trait: trait.trim(), confirmed: true })
      onOpenChange(false); onQueued(); toast.success(`${name.trim()} added`, { description: `${result.queued} voice versions are being created.` })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The voice package could not be started.") }
    finally { setBusy(null) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}><DialogContent className="voice-create-dialog">
    <DialogHeader><DialogTitle>Create a production voice</DialogTitle><DialogDescription>Add one person or character, then prepare that recording for every available method.</DialogDescription></DialogHeader>
    <nav className="voice-create-steps" aria-label="Voice creation steps">{steps.map((label, index) => <span key={label} className={cn(index === step && "active", index < step && "done")}><i>{index < step ? <Check /> : index + 1}</i>{label}</span>)}</nav>
    <div className="voice-create-stage">
      {step === 0 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Who is this voice?</h3><p>The name belongs to the person or character. Provider model IDs stay underneath it.</p></div><label><span>Voice name</span><Input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} placeholder="e.g. Serinity" /></label><div className="voice-create-sex"><span>Sex</span><ToggleGroup type="single" variant="outline" value={gender} onValueChange={(value) => { if (value === "female" || value === "male") setGender(value) }} aria-label="Voice sex"><ToggleGroupItem value="female" aria-label="Female voice"><VoiceGenderBadge gender="female" /></ToggleGroupItem><ToggleGroupItem value="male" aria-label="Male voice"><VoiceGenderBadge gender="male" /></ToggleGroupItem></ToggleGroup><small>Shown consistently anywhere this voice is selected or used.</small></div><label><span>Voice language / accent flag <small>optional</small></span><Select value={editorialLanguage} onValueChange={setEditorialLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No language focus</SelectItem>{languages.map(([code, label]) => <SelectItem value={code} key={code}>{label}</SelectItem>)}</SelectContent></Select><small>Shown beside this voice for casting. It never limits what the voice can say.</small></label><RecordingLanguageField value={recordingLanguage} onChange={setRecordingLanguage} suggestions={languages} /><label><span>Voice notes <small>optional</small></span><Textarea value={trait} maxLength={240} onChange={(event) => setTrait(event.target.value)} placeholder="Warm, intimate storyteller with a calm pace" /></label></section>}
      {step === 1 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Add the original recording</h3><p>We preserve the full file, then prepare the best passage separately for each installed recording method.</p></div>{!referenceId ? <><FileDropZone file={file} accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" disabled={Boolean(busy)} onFile={(next) => { setFile(next); setReferenceId(""); setReferenceDurationMs(null); setPlan(null); setSelectedRouteId(""); setSourceDrafts({}); setReferenceWindowIds({}); setError("") }} hint="WAV, MP3 or M4A · 5 seconds–10 minutes · up to 100 MB" /><div className="voice-recording-guidance"><span><Check /> One speaker</span><span><Check /> Clear, dry audio</span><span><Check /> Natural expression</span></div></> : plan && selectedRouteId ? <div className="voice-create-source-editor"><nav className="voice-method-picker" aria-label="Recording method source selections">{plan.routes.map((route) => <button type="button" key={route.provider_model_id} className={cn(route.provider_model_id === selectedRouteId && "active", referenceWindowIds[route.provider_model_id] && "done")} onClick={() => { setSelectedRouteId(route.provider_model_id); setError("") }}><span>{referenceWindowIds[route.provider_model_id] ? <Check /> : plan.routes.indexOf(route) + 1}</span><b>{route.label}</b><small>{referenceWindowIds[route.provider_model_id] ? "Source ready" : "Choose passage"}</small></button>)}</nav>{(() => { const route = plan.routes.find((item) => item.provider_model_id === selectedRouteId); const draft = sourceDrafts[selectedRouteId]; return route && draft ? <VoiceMethodSourceEditor route={route} referenceId={referenceId} sourceDurationMs={referenceDurationMs || 0} value={draft} onChange={(next) => setSourceDrafts((current) => ({ ...current, [selectedRouteId]: next }))} /> : null })()}</div> : null}</section>}
      {step === 2 && <section><span className="voice-create-symbol"><Sparkles /></span><div className="voice-create-heading"><h3>Ready to create {name.trim()}</h3><p>Every installed method has its own prepared passage from the preserved original recording.</p></div>{plan && <div className="voice-plan-summary"><header><b>{plan.routes.length} recording methods are ready</b><span>{plan.region_label}</span></header>{plan.routes.map((route) => <div key={route.provider_model_id}><span><b>{route.label}</b><small>{route.role} · {route.source_language_documented ? "Source language supported" : "Source language is experimental"}</small></span><em>{route.estimated_creation_cost ? `up to $${route.estimated_creation_cost.toFixed(2)}` : "Free creation"}</em></div>)}</div>}
      </section>}
      {error && <p className="voice-create-error">{error}</p>}
    </div>
      <DialogFooter><Button type="button" variant="ghost" disabled={Boolean(busy) || step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft /> Back</Button><span className="voice-create-spacer" />{step === 0 && <Button type="button" disabled={!name.trim() || !gender || !recordingLanguage.trim()} onClick={() => setStep(1)}>Continue <ChevronRight /></Button>}{step === 1 && !referenceId && <Button type="button" disabled={!file || Boolean(busy)} onClick={() => void prepareRecording()}>{busy === "upload" ? <><LoaderCircle className="spin" /> Preparing recording…</> : <>Prepare recording <ChevronRight /></>}</Button>}{step === 1 && referenceId && <Button type="button" disabled={Boolean(busy) || !selectedRouteId} onClick={() => void saveMethodSelection()}>{busy === "upload" ? <><LoaderCircle className="spin" /> Saving method…</> : <>{plan?.routes.some((route) => route.provider_model_id !== selectedRouteId && !referenceWindowIds[route.provider_model_id]) ? "Save & next method" : "Review voice"} <ChevronRight /></>}</Button>}{step === 2 && <Button type="button" disabled={!plan?.routes.length || Object.keys(referenceWindowIds).length !== plan.routes.length || Boolean(busy)} onClick={() => void create()}>{busy === "create" ? <><LoaderCircle className="spin" /> Starting…</> : <>Create voice <Sparkles /></>}</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
