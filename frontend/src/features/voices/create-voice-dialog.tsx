import { Check, ChevronLeft, ChevronRight, LoaderCircle, Mic2, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { StudioConfig, VoicePackagePlan } from "@/types/domain"

const steps = ["Identity", "Recording", "Capabilities"] as const

export function CreateVoiceDialog({ open, onOpenChange, config, onQueued }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: StudioConfig | null
  onQueued: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [recordingLanguage, setRecordingLanguage] = useState("")
  const [editorialLanguage, setEditorialLanguage] = useState("none")
  const [trait, setTrait] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [referenceId, setReferenceId] = useState("")
  const [packageId, setPackageId] = useState("complete")
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
    setStep(0); setName(""); setRecordingLanguage(""); setEditorialLanguage("none"); setTrait(""); setFile(null); setReferenceId(""); setPackageId("complete"); setPlan(null); setBusy(null); setError("")
  }, [open])

  async function uploadAndContinue() {
    if (!file) return
    setBusy("upload"); setError("")
    try { const result = await studioApi.uploadVoiceReference(file); setReferenceId(result.reference_id); setStep(2) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The recording could not be uploaded.") }
    finally { setBusy(null) }
  }
  useEffect(() => {
    if (!open || step !== 2) return
    setBusy("plan"); setError("")
    void studioApi.voicePackagePreflight(recordingLanguage, packageId).then(setPlan).catch((reason) => setError(reason instanceof Error ? reason.message : "Capabilities could not be checked.")).finally(() => setBusy(null))
  }, [recordingLanguage, open, packageId, step])

  async function create() {
    if (!referenceId || !plan?.routes.length) return
    setBusy("create"); setError("")
    try {
      const result = await studioApi.createVoicePackage({ name: name.trim(), language: recordingLanguage, editorial_language: editorialLanguage === "none" ? "" : editorialLanguage, reference_id: referenceId, package: packageId, trait: trait.trim(), confirmed: true })
      onOpenChange(false); onQueued(); toast.success(`${name.trim()} added`, { description: `${result.queued} voice versions are being created.` })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The voice package could not be started.") }
    finally { setBusy(null) }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}><DialogContent className="voice-create-dialog">
    <DialogHeader><DialogTitle>Create a production voice</DialogTitle><DialogDescription>One human voice, with every installed cloned-model version your Studio can use.</DialogDescription></DialogHeader>
    <nav className="voice-create-steps" aria-label="Voice creation steps">{steps.map((label, index) => <span key={label} className={cn(index === step && "active", index < step && "done")}><i>{index < step ? <Check /> : index + 1}</i>{label}</span>)}</nav>
    <div className="voice-create-stage">
      {step === 0 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Who is this voice?</h3><p>The name belongs to the person or character. Provider model IDs stay underneath it.</p></div><label><span>Voice name</span><Input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} placeholder="e.g. Serinity" /></label><label><span>Team language tag <small>optional</small></span><Select value={editorialLanguage} onValueChange={setEditorialLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No language focus</SelectItem>{languages.map(([code, label]) => <SelectItem value={code} key={code}>{label}</SelectItem>)}</SelectContent></Select><small>A casting label and flag for your team. It never limits what the voice can say.</small></label><label><span>Language actually spoken in the source recording</span><Select value={recordingLanguage || undefined} onValueChange={setRecordingLanguage}><SelectTrigger><SelectValue placeholder="Choose the spoken language" /></SelectTrigger><SelectContent>{languages.map(([code, label]) => <SelectItem value={code} key={code}>{label}</SelectItem>)}</SelectContent></Select><small>Required provider enrollment fact. Audio Studio will not guess or prefill it.</small></label><label><span>Voice notes <small>optional</small></span><Textarea value={trait} maxLength={240} onChange={(event) => setTrait(event.target.value)} placeholder="Warm, intimate storyteller with a calm pace" /></label></section>}
      {step === 1 && <section><span className="voice-create-symbol"><Mic2 /></span><div className="voice-create-heading"><h3>Add one clean recording</h3><p>10–20 seconds of continuous speech gives the strongest clone. No music, room noise or other speakers.</p></div><FileDropZone file={file} accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" disabled={Boolean(busy)} onFile={(next) => { setFile(next); setReferenceId(""); setError("") }} hint="WAV, MP3 or M4A · up to 10 MB" /><div className="voice-recording-guidance"><span><Check /> Normal speaking pace</span><span><Check /> One speaker</span><span><Check /> Clear, dry audio</span></div></section>}
      {step === 2 && <section><span className="voice-create-symbol"><Sparkles /></span><div className="voice-create-heading"><h3>Build the compatible model versions</h3><p>You confirmed that the source recording is {languages.find(([code]) => code === recordingLanguage)?.[1] || recordingLanguage}. This never limits the identity; it only decides which providers can register this exact recording.</p></div>{busy === "plan" && <div className="voice-plan-loading"><LoaderCircle className="spin" /> Checking installed models…</div>}{plan && <><div className="voice-package-options">{plan.packages.map((option) => <button type="button" key={option.id} disabled={!option.available} className={cn(packageId === option.id && "selected")} onClick={() => setPackageId(option.id)}><span>{packageId === option.id ? <Check /> : null}</span><div><b>{option.name}</b><small>{option.description}</small><em>{option.models.length} model version{option.models.length === 1 ? "" : "s"}</em></div></button>)}</div><div className="voice-plan-summary"><header><b>{plan.routes.length} compatible versions will be created</b><span>Alibaba {plan.region_label}</span></header>{plan.routes.map((route) => <div key={route.model_id}><span><b>{route.label}</b><small>{route.role} · {route.documented_output_languages.length} documented output languages</small></span><em>{route.estimated_creation_cost ? `up to $${route.estimated_creation_cost.toFixed(2)}` : "Free creation"}</em></div>)}</div></>}
      </section>}
      {error && <p className="voice-create-error">{error}</p>}
    </div>
      <DialogFooter><Button type="button" variant="ghost" disabled={Boolean(busy) || step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft /> Back</Button><span className="voice-create-spacer" />{step === 0 && <Button type="button" disabled={!name.trim() || !recordingLanguage} onClick={() => setStep(1)}>Continue <ChevronRight /></Button>}{step === 1 && <Button type="button" disabled={!file || Boolean(busy)} onClick={() => void uploadAndContinue()}>{busy === "upload" ? <><LoaderCircle className="spin" /> Preparing recording…</> : <>Check capabilities <ChevronRight /></>}</Button>}{step === 2 && <Button type="button" disabled={!plan?.routes.length || Boolean(busy)} onClick={() => void create()}>{busy === "create" ? <><LoaderCircle className="spin" /> Starting…</> : <>Create voice package <Sparkles /></>}</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
