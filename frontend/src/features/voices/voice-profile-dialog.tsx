import { ArrowLeft, Check, CircleAlert, FileAudio, LoaderCircle, Pause, Play, RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import { VoiceLanguageBadge } from "@/components/voice-language-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { audioUrl, studioApi } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VoicePackageRoute, VoiceProfile } from "@/types/domain"
import { VoiceMethodSourceEditor, routeSourceGuidance, type VoiceSourceDraft } from "./voice-method-source-editor"
import { bindingMatchesRoute, jobMatchesRoute } from "./voice-route"

const TAG_SAMPLES: Record<string, string> = {
  whispers: "[whispers]Keep your voice low. Someone is waiting beyond that door.",
  curious: "[curious]Wait... did that light just move behind the trees?",
  empathetic: "[empathetic]I know this has been heavy. You do not have to carry it alone.",
  sad: "[sad]She kept the old letter, even after the ink had begun to fade.",
  excited: "[excited]We found it! The door was here the entire time!",
  angry: "[angry]You knew the truth, and you still let them walk into that room.",
  sighing: "[sighing]I thought we would have more time.",
  "clears throat": "[clears throat]All right. Let us begin from the first page.",
  serious: "[serious]What happens next depends on the choice we make now.",
  asmr: "[asmr]Listen closely to the rain brushing softly against the window.",
}

const NEUTRAL_TEST = "The morning arrived quietly, carrying the promise of a new beginning."

function routeLabel(route: VoicePackageRoute) {
  return route.label || route.model_id
}

function languageLabel(value: string | null | undefined) {
  if (!value) return "Not documented"
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(value) || value.toUpperCase() }
  catch { return value.toUpperCase() }
}

function methodFailureMessage(error: string | null | undefined) {
  if (!error) return "The previous setup did not complete. Choose a passage and try again."
  if (/duration|too long|maximum allowed/i.test(error)) return "The previous passage was too long. Choose a shorter section and try again."
  if (/transcript/i.test(error)) return "The spoken words did not match the supplied transcript. Check the exact words and try again."
  return "The previous setup did not complete. Choose a passage and try again."
}

export function VoiceProfileDialog({ profile, open, onOpenChange, onEditIdentity, onChanged }: {
  profile: VoiceProfile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditIdentity: () => void
  onChanged: () => void
}) {
  const player = useGlobalPlayer()
  const [tab, setTab] = useState("voice")
  const [referenceId, setReferenceId] = useState("")
  const [setupRouteId, setSetupRouteId] = useState("")
  const [sourceDraft, setSourceDraft] = useState<VoiceSourceDraft>({ startMs: 0, durationMs: 20_000, transcript: "", preprocess: false })
  const [setupBusy, setSetupBusy] = useState(false)
  const [testingBinding, setTestingBinding] = useState("")
  const [testingTag, setTestingTag] = useState("neutral")
  const [testText, setTestText] = useState(NEUTRAL_TEST)
  const [testBusy, setTestBusy] = useState(false)

  const reference = profile?.references.find((item) => item.id === referenceId) || profile?.references[0]
  const setupRoute = profile?.available_routes.find((item) => item.provider_model_id === setupRouteId)
  const selectedBinding = profile?.bindings.find((item) => item.binding_id === testingBinding)
    || profile?.bindings.find((item) => item.validation_state === "approved")
    || profile?.bindings[0]
  const supportsTags = selectedBinding?.engine === "audio" && selectedBinding?.tier === "flash"
  const usedTags = profile?.used_tags || []
  const previews = profile?.previews || []
  const tagOptions = useMemo(() => [...new Set([...(profile?.used_tags || []), ...Object.keys(TAG_SAMPLES)])], [profile?.used_tags])

  useEffect(() => {
    if (!profile || !open) return
    const nextReference = profile.references.find((item) => item.id === profile.preferred_reference_id) || profile.references[0]
    const nextBinding = profile.bindings.find((item) => item.validation_state === "candidate")
      || profile.bindings.find((item) => item.validation_state === "approved")
      || profile.bindings[0]
    setReferenceId(nextReference?.id || "")
    setTestingBinding(nextBinding?.binding_id || "")
    setTestingTag("neutral")
    setTestText(NEUTRAL_TEST)
    setSetupRouteId("")
    setTab("voice")
  }, [open, profile])

  useEffect(() => {
    if (!supportsTags && testingTag !== "neutral") setTestingTag("neutral")
  }, [supportsTags, testingTag])

  useEffect(() => {
    setTestText(testingTag === "neutral" ? NEUTRAL_TEST : TAG_SAMPLES[testingTag] || `[${testingTag}]Read this line as a deliberate voice test.`)
  }, [testingTag])

  if (!profile) return null
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const image = String(profile.metadata.image || "")
  const sourceDurationMs = reference?.duration_ms || 0
  const approvedCount = profile.bindings.filter((binding) => binding.validation_state === "approved").length
  const replacingMethod = Boolean(setupRoute && profile.bindings.some((binding) => binding.validation_state === "approved" && bindingMatchesRoute(binding, setupRoute)))

  function beginMethodSetup(route: VoicePackageRoute) {
    if (!reference) return
    const windows = reference.windows || []
    const existing = windows.find((item) => item.provider_model_id === route.provider_model_id)
      || windows.find((item) => !item.provider_model_id)
    const guidance = routeSourceGuidance(route)
    setSourceDraft({
      startMs: existing?.start_ms || 0,
      durationMs: Math.min(existing?.duration_ms || guidance.recommendedMaximumMs, sourceDurationMs || guidance.recommendedMaximumMs, guidance.maximumMs),
      // A full-recording transcript cannot be guessed into an arbitrary
      // sub-selection. Only reuse transcript truth saved for this exact
      // method window.
      transcript: existing?.transcript || "",
      preprocess: route.adapter_key === "audio" && Boolean(existing?.enable_preprocess),
    })
    setSetupRouteId(route.provider_model_id)
    setTab("methods")
  }

  async function createMethodVersion() {
    if (!reference || !setupRoute) return
    const guidance = routeSourceGuidance(setupRoute)
    if (sourceDraft.durationMs < guidance.minimumMs || sourceDraft.durationMs > guidance.maximumMs) {
      toast.error(`${routeLabel(setupRoute)} needs a source between ${guidance.minimumMs / 1000} and ${guidance.maximumMs / 1000} seconds.`)
      return
    }
    setSetupBusy(true)
    try {
      const updated = await studioApi.saveVoiceReferenceWindow(profile!.id, reference.id, {
        provider_model_id: setupRoute.provider_model_id,
        start_ms: sourceDraft.startMs,
        duration_ms: sourceDraft.durationMs,
        source_language: reference.source_language || profile!.metadata.recording_language || "en",
        transcript: sourceDraft.transcript,
        enable_preprocess: setupRoute.adapter_key === "audio" ? sourceDraft.preprocess : null,
      })
      const savedReference = updated.references.find((item) => item.id === reference.id)
      const savedWindow = savedReference?.windows?.find((item) => item.provider_model_id === setupRoute.provider_model_id)
      if (!savedWindow) throw new Error("The selected source could not be prepared for this recording method.")
      await studioApi.createVoicePackage({
        name: profile!.name,
        identity_id: profile!.id,
        reference_id: reference.id,
        reference_window_ids: { [setupRoute.provider_model_id]: savedWindow.id },
        provider_model_ids: [setupRoute.provider_model_id],
        language: savedWindow.source_language || reference.source_language || "en",
        package: "complete",
        confirmed: true,
      })
      toast.success(`${routeLabel(setupRoute)} is creating a test version`, { description: "Your current ready version stays available until you approve the new one." })
      setSetupRouteId("")
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "That recording method could not be created.")
    } finally { setSetupBusy(false) }
  }

  async function createPreview() {
    if (!selectedBinding || !testText.trim()) return
    setTestBusy(true)
    try {
      const created = await studioApi.createVoicePreview(profile!.id, {
        binding_id: selectedBinding.binding_id,
        tag: testingTag === "neutral" ? null : testingTag,
        text: testText.trim(), instruction: "", seed: 0,
        language: reference?.source_language || profile!.metadata.recording_language || "Auto",
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
      toast.success(approvalState === "approved" ? "New recording method approved" : approvalState === "rejected" ? "Test version rejected" : "Voice test returned to review")
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "That Voice test decision could not be saved.")
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="voice-profile-dialog">
    <DialogHeader className="voice-profile-dialog-header"><div className="voice-profile-dialog-identity"><span className="voice-profile-dialog-avatar">{image ? <img src={image} alt="" /> : initials}</span><span><DialogTitle>{profile.name}</DialogTitle><VoiceGenderBadge gender={profile.metadata.gender} /><VoiceLanguageBadge language={String(profile.metadata.editorial_language || "")} /><DialogDescription>{profile.metadata.trait || "Cloned production voice"}</DialogDescription></span></div><Button variant="outline" size="sm" onClick={onEditIdentity}><SlidersHorizontal /> Edit identity</Button></DialogHeader>
    <Tabs value={tab} onValueChange={(next) => { setTab(next); if (next !== "methods") setSetupRouteId("") }} className="voice-profile-tabs">
      <TabsList><TabsTrigger value="voice">Voice</TabsTrigger><TabsTrigger value="methods">Recording methods</TabsTrigger><TabsTrigger value="tests">Voice tests</TabsTrigger></TabsList>
      <ScrollArea className="voice-profile-dialog-scroll">
        <TabsContent value="voice" className="voice-profile-panel voice-overview-panel">
          <header className="voice-profile-section-heading"><span><h3>Ready to create with {profile.name}</h3><p>Listen to the voice, see which recording methods are ready, or prepare a new version for one method.</p></span></header>
          <div className="voice-overview-summary"><section><strong>{approvedCount}</strong><span>recording {approvedCount === 1 ? "method" : "methods"} ready</span><Button variant="outline" size="sm" onClick={() => setTab("methods")}>Manage methods</Button></section><section><strong>{previews.filter((item) => item.status === "ready").length}</strong><span>saved voice tests</span><Button variant="outline" size="sm" onClick={() => setTab("tests")}>Open voice tests</Button></section></div>
          {reference ? <section className="voice-master-summary"><span className="voice-master-icon"><FileAudio /></span><div><h4>Original recording</h4><b>{reference.original_name}</b><p>{formatDuration(sourceDurationMs / 1000)} · {reference.sample_rate ? `${reference.sample_rate / 1000} kHz` : "Sample rate unavailable"} · {reference.channels === 1 ? "Mono" : reference.channels === 2 ? "Stereo" : "Channels unavailable"} · {languageLabel(reference.source_language || profile.metadata.recording_language)}</p></div><Badge variant="outline">Preserved master</Badge></section> : <div className="voice-profile-empty compact"><CircleAlert /><h3>No original recording</h3><p>Add a source recording before setting up another method.</p></div>}
        </TabsContent>
        <TabsContent value="methods" className="voice-profile-panel">
          {setupRoute && reference ? <><button type="button" className="voice-method-back" onClick={() => setSetupRouteId("")}><ArrowLeft /> All recording methods</button><header className="voice-profile-section-heading voice-method-setup-heading"><span><h3>{replacingMethod ? "Reclone for" : "Set up"} {routeLabel(setupRoute)}</h3><p>Choose the strongest passage for this method. The original recording stays unchanged.</p></span></header><VoiceMethodSourceEditor route={setupRoute} referenceId={reference.id} sourceDurationMs={sourceDurationMs} value={sourceDraft} onChange={setSourceDraft} /><footer className="voice-profile-panel-actions"><span>This creates a test version. Nothing ready today is replaced until you approve it.</span><Button onClick={() => void createMethodVersion()} disabled={setupBusy}>{setupBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {setupBusy ? "Creating…" : "Create test version"}</Button></footer></> : <><header className="voice-profile-section-heading"><span><h3>Recording methods</h3><p>Each method gets its own carefully chosen passage from the preserved original recording.</p></span></header><div className="voice-method-list">{profile.available_routes.map((route) => {
            const bindings = profile.bindings.filter((binding) => bindingMatchesRoute(binding, route))
            const approved = bindings.find((binding) => binding.validation_state === "approved")
            const candidates = bindings.filter((binding) => binding.validation_state === "candidate")
            const job = profile.jobs.find((item) => jobMatchesRoute(item, route) && ["queued", "creating", "failed", "interrupted"].includes(item.status))
            const working = Boolean(job && ["queued", "creating"].includes(job.status))
            const failed = Boolean(job && ["failed", "interrupted"].includes(job.status))
            const stateKind = candidates.length ? "review" : approved ? "ready" : failed ? "failed" : working ? "working" : "setup"
            const state = candidates.length ? "New version ready — listen in Voice tests" : approved ? "Ready to use" : failed ? methodFailureMessage(job?.error) : working ? "Creating test version…" : "Needs setup"
            return <article key={route.provider_model_id}><span className={cn("voice-method-state", stateKind)}>{working ? <LoaderCircle className="spin" /> : approved ? <Check /> : failed ? <CircleAlert /> : <X />}</span><div><h4>{routeLabel(route)}</h4><p>{route.role}</p><span className={`voice-method-status-copy ${stateKind}`}>{state}</span></div><Button variant="outline" size="sm" disabled={!reference || working} onClick={() => beginMethodSetup(route)}><RefreshCw /> {approved ? "Reclone" : "Set up"}</Button></article>
          })}</div></>}
        </TabsContent>
        <TabsContent value="tests" className="voice-profile-panel">
          <header className="voice-profile-section-heading"><span><h3>Hear what this voice can do</h3><p>Create useful listening samples for the exact recording method you plan to use.</p></span></header>
          <div className="voice-lab-compose"><label><span>Recording method</span><Select value={selectedBinding?.binding_id || ""} onValueChange={(value) => { setTestingBinding(value); setTestingTag("neutral") }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{profile.bindings.filter((binding) => ["approved", "candidate"].includes(binding.validation_state)).map((binding) => { const route = profile.available_routes.find((item) => bindingMatchesRoute(binding, item)); return <SelectItem value={binding.binding_id} key={binding.binding_id}>{binding.validation_state === "candidate" ? "New version · " : ""}{route ? routeLabel(route) : binding.model_id}</SelectItem> })}</SelectContent></Select></label>{supportsTags && <label><span>Expression</span><Select value={testingTag} onValueChange={setTestingTag}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Natural reading</SelectItem>{tagOptions.map((tag) => <SelectItem value={tag} key={tag}>{usedTags.includes(tag) ? `${tag} · used before` : tag}</SelectItem>)}</SelectContent></Select></label>}<label className="wide"><span>Test sentence</span><Textarea value={testText} onChange={(event) => setTestText(event.target.value)} /></label><div className="voice-lab-submit"><span>{supportsTags ? "The expression marker controls the words that follow it." : "This method reads the test sentence without inline expression markers."}</span><Button onClick={() => void createPreview()} disabled={!selectedBinding || testBusy}>{testBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {testBusy ? "Generating…" : "Generate voice test"}</Button></div></div>
          <div className="voice-preview-list">{previews.map((preview) => { const isPlaying = player.source?.key === `voice-preview:${preview.id}` && player.state === "playing"; const binding = profile.bindings.find((item) => item.binding_id === preview.binding_id); const route = profile.available_routes.find((item) => binding && bindingMatchesRoute(binding, item)); const newVersion = binding?.validation_state === "candidate"; return <article key={preview.id}><OperatorIconButton label={isPlaying ? "Pause voice test" : "Play voice test"} disabled={preview.status !== "ready"} onClick={() => preview.filename && void player.toggleSource({ key: `voice-preview:${preview.id}`, url: audioUrl(preview.filename), title: profile.name, subtitle: preview.tag || route?.label || preview.model_id, kind: "voice" })}>{isPlaying ? <Pause /> : <Play />}</OperatorIconButton><div><b>{preview.tag || "Natural reading"}</b><p>{preview.text}</p><small>{newVersion ? "New version · " : ""}{route ? routeLabel(route) : preview.model_id} · {preview.status}</small></div>{newVersion && preview.status === "ready" ? <div className="voice-preview-decisions"><Button size="sm" variant="outline" onClick={() => void decidePreview(preview.id, "rejected")}>Reject</Button><Button size="sm" onClick={() => void decidePreview(preview.id, "approved")}>Approve</Button></div> : <Badge variant="outline">{preview.approval_state === "approved" ? "Approved" : preview.approval_state === "rejected" ? "Rejected" : "Saved test"}</Badge>}</article> })}{!previews.length && <div className="voice-profile-empty compact"><Sparkles /><h3>No voice tests yet</h3><p>Choose a ready recording method and create one useful listening sample.</p></div>}</div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  </DialogContent></Dialog>
}
