import { Check, CircleAlert, LoaderCircle, Pause, Play, RefreshCw, Save, SlidersHorizontal, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AudioSourceEditor } from "@/features/sound-scene/source-editor/music-source-editor"
import { audioUrl, studioApi } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VoiceProfile, VoiceProfileBinding, VoicePackageRoute } from "@/types/domain"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import { bindingMatchesRoute, jobMatchesRoute } from "./voice-route"

const TAG_SAMPLES: Record<string, string> = {
  whispers: "[whispers] The house is quiet now. You can let the whole day go.",
  curious: "[curious] Wait... did that light just move behind the trees?",
  empathetic: "[empathetic] I know this has been heavy. You do not have to carry it alone.",
  sad: "[sad] She kept the old letter, even after the ink had begun to fade.",
  excited: "[excited] We found it! The door was here the entire time!",
  angry: "[angry] You knew the truth, and you still let them walk into that room.",
  sighing: "[sighing] I thought we would have more time.",
  "clears throat": "[clears throat] All right. Let us begin from the first page.",
  serious: "[serious] What happens next depends on the choice we make now.",
  asmr: "[asmr] Listen closely to the rain brushing softly against the window.",
}

function routeLabel(route: VoicePackageRoute) {
  return route.label || route.model_id
}

export function VoiceProfileDialog({ profile, open, onOpenChange, onEditIdentity, onChanged }: {
  profile: VoiceProfile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditIdentity: () => void
  onChanged: () => void
}) {
  const player = useGlobalPlayer()
  const [referenceId, setReferenceId] = useState("")
  const [modelScope, setModelScope] = useState("default")
  const [startMs, setStartMs] = useState(0)
  const [durationMs, setDurationMs] = useState(20_000)
  const [language, setLanguage] = useState("")
  const [transcript, setTranscript] = useState("")
  const [preprocess, setPreprocess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingBinding, setTestingBinding] = useState("")
  const [testingTag, setTestingTag] = useState("neutral")
  const [testText, setTestText] = useState("")
  const [testBusy, setTestBusy] = useState(false)
  const reference = profile?.references.find((item) => item.id === referenceId) || profile?.references[0]
  const selectedWindow = useMemo(() => {
    if (!reference) return undefined
    const windows = reference.windows || []
    const exact = modelScope === "default" ? undefined : windows.find((item) => item.provider_model_id === modelScope)
    return exact || windows.find((item) => !item.provider_model_id)
  }, [modelScope, reference])
  const selectedBinding = profile?.bindings.find((item) => item.binding_id === testingBinding) || profile?.bindings[0]
  const supportsTags = selectedBinding?.engine === "audio" && selectedBinding?.tier === "flash"
  const usedTags = profile?.used_tags || []
  const previews = profile?.previews || []
  const tagOptions = useMemo(() => {
    const used = profile?.used_tags || []
    return [...new Set([...used, ...Object.keys(TAG_SAMPLES)])]
  }, [profile?.used_tags])

  useEffect(() => {
    if (!profile || !open) return
    const nextReference = profile.references.find((item) => item.id === profile.preferred_reference_id) || profile.references[0]
    setReferenceId(nextReference?.id || "")
    setTestingBinding((profile.bindings.find((item) => item.validation_state === "candidate") || profile.bindings.find((item) => item.validation_state === "approved") || profile.bindings[0])?.binding_id || "")
    setModelScope("default")
  }, [open, profile])

  useEffect(() => {
    if (!reference) return
    setStartMs(selectedWindow?.start_ms || 0)
    setDurationMs(selectedWindow?.duration_ms || Math.min(reference.duration_ms || 20_000, 20_000))
    setLanguage(selectedWindow?.source_language || reference.source_language || "")
    setTranscript(selectedWindow?.transcript || reference.transcript || "")
    setPreprocess(Boolean(selectedWindow?.enable_preprocess))
  }, [reference, selectedWindow])

  useEffect(() => {
    if (testingTag === "neutral") {
      setTestText("The morning arrived quietly, carrying the promise of a new beginning.")
    } else {
      setTestText(TAG_SAMPLES[testingTag] || `[${testingTag}] Read this line as a deliberate voice test.`)
    }
  }, [testingTag])

  if (!profile) return null
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const image = String(profile.metadata.image || "")
  const sourceDurationMs = reference?.duration_ms || 0
  const exactWindow = modelScope !== "default" && (reference?.windows || []).some((item) => item.provider_model_id === modelScope)

  async function saveWindow() {
    if (!reference) return
    setSaving(true)
    try {
      await studioApi.saveVoiceReferenceWindow(profile!.id, reference.id, {
        provider_model_id: modelScope === "default" ? null : modelScope,
        start_ms: startMs,
        duration_ms: durationMs,
        source_language: language,
        transcript,
        enable_preprocess: modelScope.includes("qwen-audio") ? preprocess : null,
      })
      toast.success("Voice Source window saved")
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The source window could not be saved.")
    } finally { setSaving(false) }
  }

  async function reclone(route: VoicePackageRoute) {
    if (!reference) return
    const windows = reference.windows || []
    const targetWindow = windows.find((item) => item.provider_model_id === route.provider_model_id)
      || windows.find((item) => !item.provider_model_id)
    if (!targetWindow) return
    try {
      await studioApi.createVoicePackage({
        name: profile!.name,
        identity_id: profile!.id,
        reference_id: reference.id,
        reference_window_id: targetWindow.id,
        provider_model_ids: [route.provider_model_id],
        language: targetWindow.source_language || reference.source_language || "en",
        package: "complete",
        confirmed: true,
      })
      toast.success(`${routeLabel(route)} candidate queued`, { description: "The current working binding remains available until you validate the new one." })
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "That method could not be rebuilt.")
    }
  }

  async function createPreview() {
    if (!selectedBinding || !testText.trim()) return
    setTestBusy(true)
    try {
      const created = await studioApi.createVoicePreview(profile!.id, {
        binding_id: selectedBinding.binding_id,
        tag: testingTag === "neutral" ? null : testingTag,
        text: testText.trim(), instruction: "", seed: 0,
        language: language || profile!.metadata.recording_language || "Auto",
      })
      await studioApi.voicePreviewResult(created.job_id)
      toast.success("Voice test ready")
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The voice test failed.")
    } finally { setTestBusy(false) }
  }

  async function decidePreview(previewId: string, approvalState: "unreviewed" | "approved" | "rejected") {
    try {
      await studioApi.approveVoicePreview(profile!.id, previewId, approvalState)
      toast.success(approvalState === "approved" ? "Method approved for Production" : approvalState === "rejected" ? "Candidate rejected" : "Voice test returned to review")
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "That Voice test decision could not be saved.")
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="voice-profile-dialog">
    <DialogHeader className="voice-profile-dialog-header"><div className="voice-profile-dialog-identity"><span className="voice-profile-dialog-avatar">{image ? <img src={image} alt="" /> : initials}</span><span><DialogTitle>{profile.name}</DialogTitle><DialogDescription>{profile.metadata.trait || "Cloned production voice"}</DialogDescription><VoiceGenderBadge gender={profile.metadata.gender} /></span></div><Button variant="outline" size="sm" onClick={onEditIdentity}><SlidersHorizontal /> Edit identity</Button></DialogHeader>
    <Tabs defaultValue="source" className="voice-profile-tabs">
      <TabsList><TabsTrigger value="source">Voice Source</TabsTrigger><TabsTrigger value="methods">Methods <span>{profile.bindings.length}</span></TabsTrigger><TabsTrigger value="lab">Test Lab <span>{previews.length}</span></TabsTrigger></TabsList>
      <ScrollArea className="voice-profile-dialog-scroll">
        <TabsContent value="source" className="voice-profile-panel">
          {!reference ? <div className="voice-profile-empty"><CircleAlert /><h3>No preserved Voice Source</h3><p>Add a clean source recording before rebuilding this Voice.</p></div> : <>
            <header className="voice-profile-section-heading"><span><h3>Choose the performance evidence</h3><p>The master stays untouched. Every method receives only this selected window.</p></span><Select value={modelScope} onValueChange={setModelScope}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Default for all methods</SelectItem>{profile.available_routes.map((route) => <SelectItem key={route.provider_model_id} value={route.provider_model_id}>{routeLabel(route)} override</SelectItem>)}</SelectContent></Select></header>
            <div className="voice-source-facts"><span><b>{reference.original_name}</b> immutable master</span><span>{formatDuration(sourceDurationMs / 1000)}</span><span>{reference.sample_rate ? `${reference.sample_rate / 1000} kHz` : "Sample rate unknown"}</span><span>{reference.channels === 1 ? "Mono" : reference.channels === 2 ? "Stereo" : "Channels unknown"}</span></div>
            <AudioSourceEditor url={`/api/v1/voice-references/${encodeURIComponent(reference.id)}/audio`} peaksUrl={`/api/v1/voice-references/${encodeURIComponent(reference.id)}/peaks`} sourceDuration={sourceDurationMs / 1000} sourceOffset={startMs / 1000} usedDuration={durationMs / 1000} loop={false} onChange={(window) => { setStartMs(window.sourceOffsetMs); setDurationMs(window.durationMs || durationMs) }} onCommit={(window) => { setStartMs(window.sourceOffsetMs); setDurationMs(window.durationMs || durationMs) }} />
            <div className="voice-source-fields"><label><span>Source language</span><Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="English" /></label><label className="wide"><span>Exact transcript of this selected window</span><Textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Required for the strongest Qwen3 TTS VC result" /></label>{modelScope.includes("qwen-audio") && <label className="voice-source-switch wide"><Switch checked={preprocess} onCheckedChange={setPreprocess} /><span><b>Clean noisy source</b><small>Enable only when the selected recording contains room noise or interference.</small></span></label>}</div>
            <footer className="voice-profile-panel-actions"><span>{exactWindow ? "This method has its own source window." : modelScope === "default" ? "Used by every method without an override." : "Currently inheriting the default window."}</span><Button onClick={() => void saveWindow()} disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Save />} {saving ? "Saving…" : "Save selection"}</Button></footer>
          </>}
        </TabsContent>
        <TabsContent value="methods" className="voice-profile-panel"><header className="voice-profile-section-heading"><span><h3>Installed recording methods</h3><p>Exact model, source evidence and candidate state stay visible here—not on every casting card.</p></span></header><div className="voice-method-list">{profile.available_routes.map((route) => {
          const bindings = profile.bindings.filter((binding) => bindingMatchesRoute(binding, route))
          const approved = bindings.find((binding) => binding.validation_state === "approved")
          const candidates = bindings.filter((binding) => binding.validation_state === "candidate")
          const job = profile.jobs.find((item) => jobMatchesRoute(item, route) && ["queued", "creating", "failed", "interrupted"].includes(item.status))
          return <article key={route.provider_model_id}><span className={cn("voice-method-state", approved && "ready", job && ["queued", "creating"].includes(job.status) && "working", job && ["failed", "interrupted"].includes(job.status) && "failed")}>{job && ["queued", "creating"].includes(job.status) ? <LoaderCircle className="spin" /> : approved ? <Check /> : job ? <CircleAlert /> : <X />}</span><div><h4>{routeLabel(route)}</h4><p>{route.provider} · {route.region} · {route.model_id}</p><span>{candidates.length ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} waiting for a Test Lab decision` : approved ? "Approved for Production" : job?.error || "Not built"}</span></div><Button variant="outline" size="sm" disabled={!reference || Boolean(job && ["queued", "creating"].includes(job.status))} onClick={() => void reclone(route)}><RefreshCw /> {approved ? "Build candidate" : "Create"}</Button></article>
        })}</div></TabsContent>
        <TabsContent value="lab" className="voice-profile-panel"><header className="voice-profile-section-heading"><span><h3>Hear what this Voice can actually do</h3><p>Each sample keeps its method, text, tag, seed and approval—not just an anonymous audio file.</p></span></header><div className="voice-lab-compose"><label><span>Recording method</span><Select value={selectedBinding?.binding_id || ""} onValueChange={setTestingBinding}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{profile.bindings.filter((binding) => ["approved", "candidate"].includes(binding.validation_state)).map((binding) => <SelectItem value={binding.binding_id} key={binding.binding_id}>{binding.validation_state === "candidate" ? "Candidate · " : "Approved · "}{binding.model_id}</SelectItem>)}</SelectContent></Select></label><label><span>Delivery test</span><Select value={testingTag} onValueChange={setTestingTag}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Neutral method test</SelectItem>{supportsTags && tagOptions.map((tag) => <SelectItem value={tag} key={tag}>{usedTags.includes(tag) ? `${tag} · used in Studio` : tag}</SelectItem>)}</SelectContent></Select></label><label className="wide"><span>Meaningful test line</span><Textarea value={testText} onChange={(event) => setTestText(event.target.value)} /></label><div className="voice-lab-submit"><span>{supportsTags ? "Qwen Audio Flash can test the selected delivery tag." : "This method receives a neutral exact-reading test."}</span><Button onClick={() => void createPreview()} disabled={!selectedBinding || testBusy}>{testBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {testBusy ? "Generating…" : "Generate test"}</Button></div></div><div className="voice-preview-list">{previews.map((preview) => {
          const isPlaying = player.source?.key === `voice-preview:${preview.id}` && player.state === "playing"
          const binding = profile.bindings.find((item) => item.binding_id === preview.binding_id)
          return <article key={preview.id}><OperatorIconButton label={isPlaying ? "Pause voice test" : "Play voice test"} disabled={preview.status !== "ready"} onClick={() => preview.filename && void player.toggleSource({ key: `voice-preview:${preview.id}`, url: audioUrl(preview.filename), title: profile.name, subtitle: preview.tag || preview.model_id, kind: "voice" })}>{isPlaying ? <Pause /> : <Play />}</OperatorIconButton><div><b>{preview.tag || "Neutral"}</b><p>{preview.text}</p><small>{binding?.validation_state === "candidate" ? "Candidate · " : ""}{preview.model_id} · seed {preview.seed} · {preview.status}</small></div><Select value={preview.approval_state} onValueChange={(value) => void decidePreview(preview.id, value as "unreviewed" | "approved" | "rejected")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unreviewed">Unreviewed</SelectItem><SelectItem value="approved">Approve method</SelectItem><SelectItem value="rejected">Reject candidate</SelectItem></SelectContent></Select></article>
        })}{!previews.length && <div className="voice-profile-empty compact"><Sparkles /><h3>No saved tests yet</h3><p>Create a neutral method test or a meaningful delivery-tag sample.</p></div>}</div></TabsContent>
      </ScrollArea>
    </Tabs>
  </DialogContent></Dialog>
}
