import { ArrowLeft, Check, CircleAlert, FileAudio, LoaderCircle, Pause, Pencil, Play, RefreshCw, Sparkles, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import { VoiceLanguageBadge } from "@/components/voice-language-badge"
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
  const [tab, setTab] = useState("methods")
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
  const approvedBindings = profile?.bindings.filter((item) => item.validation_state === "approved") || []
  const selectedBinding = approvedBindings.find((item) => item.binding_id === testingBinding)
    || approvedBindings[0]
  const supportsTags = selectedBinding?.engine === "audio" && selectedBinding?.tier === "flash"
  const usedTags = profile?.used_tags || []
  const previews = (profile?.previews || []).filter((item) => item.binding_id === selectedBinding?.binding_id)
  const tagOptions = useMemo(() => [...new Set([...(profile?.used_tags || []), ...Object.keys(TAG_SAMPLES)])], [profile?.used_tags])

  useEffect(() => {
    if (!profile || !open) return
    const nextReference = profile.references.find((item) => item.id === profile.preferred_reference_id) || profile.references[0]
    const nextBinding = profile.bindings.find((item) => item.validation_state === "approved")
    setReferenceId(nextReference?.id || "")
    setTestingBinding(nextBinding?.binding_id || "")
    setTestingTag("neutral")
    setTestText(NEUTRAL_TEST)
    setSetupRouteId("")
    setTab("methods")
  // Reset only when this identity is opened. A data refresh after an action
  // must not throw the operator back to another tab.
  }, [open, profile?.id])

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
  const replacingMethod = Boolean(setupRoute && profile.bindings.some((binding) => binding.validation_state === "approved" && bindingMatchesRoute(binding, setupRoute)))

  function openTests(bindingId: string) {
    setTestingBinding(bindingId)
    setTestingTag("neutral")
    setSetupRouteId("")
    setTab("tests")
  }

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
      toast.success(`${replacingMethod ? "Recloning" : "Setting up"} ${routeLabel(setupRoute)}…`, { description: "The completed method becomes active automatically." })
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

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="voice-profile-dialog">
    <DialogHeader className="voice-profile-dialog-header"><div className="voice-profile-dialog-identity"><span className="voice-profile-dialog-avatar">{image ? <img src={image} alt="" /> : initials}</span><span><span className="voice-profile-title-row"><DialogTitle>{profile.name}</DialogTitle><VoiceGenderBadge gender={profile.metadata.gender} /><VoiceLanguageBadge language={String(profile.metadata.editorial_language || "")} /><Button variant="ghost" size="sm" onClick={onEditIdentity}><Pencil /> Edit</Button></span><DialogDescription>{profile.metadata.trait || "Cloned production voice"}</DialogDescription></span></div></DialogHeader>
    <Tabs value={tab} onValueChange={(next) => { setTab(next); if (next !== "methods") setSetupRouteId("") }} className="voice-profile-tabs">
      <TabsList><TabsTrigger value="methods">Recording methods</TabsTrigger><TabsTrigger value="tests">Voice tests</TabsTrigger></TabsList>
      <ScrollArea className="voice-profile-dialog-scroll">
        <TabsContent value="methods" className="voice-profile-panel">
          {setupRoute && reference ? <><button type="button" className="voice-method-back" onClick={() => setSetupRouteId("")}><ArrowLeft /> All recording methods</button><header className="voice-profile-section-heading voice-method-setup-heading"><span><h3>{replacingMethod ? "Reclone" : "Set up"} {routeLabel(setupRoute)}</h3><p>Choose the strongest passage for this method. The original recording stays unchanged.</p></span></header><VoiceMethodSourceEditor route={setupRoute} referenceId={reference.id} sourceDurationMs={sourceDurationMs} value={sourceDraft} onChange={setSourceDraft} /><footer className="voice-profile-panel-actions"><span>{replacingMethod ? "A successful reclone becomes active. The previous clone remains in recording history." : "The completed method becomes available for recording and voice tests."}</span><Button onClick={() => void createMethodVersion()} disabled={setupBusy}>{setupBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {setupBusy ? "Starting…" : replacingMethod ? "Reclone method" : "Set up method"}</Button></footer></> : <><header className="voice-profile-section-heading"><span><h3>Recording methods</h3><p>Each method uses a passage chosen from the preserved original recording.</p></span></header>{reference ? <section className="voice-master-summary"><span className="voice-master-icon"><FileAudio /></span><div><h4>Original recording</h4><b>{reference.original_name}</b><p>{formatDuration(sourceDurationMs / 1000)} · {reference.sample_rate ? `${reference.sample_rate / 1000} kHz` : "Sample rate unavailable"} · {reference.channels === 1 ? "Mono" : reference.channels === 2 ? "Stereo" : "Channels unavailable"} · {languageLabel(reference.source_language || profile.metadata.recording_language)}</p></div><span className="voice-master-preserved">Preserved master</span></section> : <div className="voice-profile-empty compact"><CircleAlert /><h3>No original recording</h3><p>Add a source recording before setting up a method.</p></div>}<div className="voice-method-list">{profile.available_routes.map((route) => {
            const bindings = profile.bindings.filter((binding) => bindingMatchesRoute(binding, route))
            const approved = bindings.find((binding) => binding.validation_state === "approved")
            const job = profile.jobs.find((item) => jobMatchesRoute(item, route) && ["queued", "creating", "failed", "interrupted"].includes(item.status))
            const working = Boolean(job && ["queued", "creating"].includes(job.status))
            const failed = Boolean(job && ["failed", "interrupted"].includes(job.status))
            const stateKind = working ? "working" : approved ? "ready" : failed ? "failed" : "setup"
            const state = working ? "Creating…" : approved ? "Ready" : failed ? methodFailureMessage(job?.error) : "Not set up"
            return <article key={route.provider_model_id}><span className={cn("voice-method-state", stateKind)}>{working ? <LoaderCircle className="spin" /> : approved ? <Check /> : failed ? <CircleAlert /> : <X />}</span><div><h4>{routeLabel(route)}</h4><p>{route.role}</p><span className={`voice-method-status-copy ${stateKind}`}>{state}</span></div><div className="voice-method-actions">{approved && <Button variant="outline" size="sm" onClick={() => openTests(approved.binding_id)}><Play /> Test voice</Button>}<Button variant="ghost" size="sm" disabled={!reference || working} onClick={() => beginMethodSetup(route)}><RefreshCw /> {approved ? "Reclone" : "Set up"}</Button></div></article>
          })}</div></>}
        </TabsContent>
        <TabsContent value="tests" className="voice-profile-panel">
          <header className="voice-profile-section-heading"><span><h3>Hear what this voice can do</h3><p>Create useful listening samples for the exact recording method you plan to use.</p></span></header>
          <div className="voice-lab-compose"><label><span>Recording method</span><Select value={selectedBinding?.binding_id || ""} onValueChange={(value) => { setTestingBinding(value); setTestingTag("neutral") }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{approvedBindings.map((binding) => { const route = profile.available_routes.find((item) => bindingMatchesRoute(binding, item)); return <SelectItem value={binding.binding_id} key={binding.binding_id}>{route ? routeLabel(route) : binding.model_id}</SelectItem> })}</SelectContent></Select></label>{supportsTags && <label><span>Expression</span><Select value={testingTag} onValueChange={setTestingTag}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Natural reading</SelectItem>{tagOptions.map((tag) => <SelectItem value={tag} key={tag}>{usedTags.includes(tag) ? `${tag} · used before` : tag}</SelectItem>)}</SelectContent></Select></label>}<label className="wide"><span>Test sentence</span><Textarea value={testText} onChange={(event) => setTestText(event.target.value)} /></label><div className="voice-lab-submit"><span>{supportsTags ? "The expression marker controls the words that follow it." : "This method reads the test sentence without inline expression markers."}</span><Button onClick={() => void createPreview()} disabled={!selectedBinding || testBusy}>{testBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {testBusy ? "Generating…" : "Generate voice test"}</Button></div></div>
          <div className="voice-preview-list">{previews.map((preview) => { const isPlaying = player.source?.key === `voice-preview:${preview.id}` && player.state === "playing"; const binding = profile.bindings.find((item) => item.binding_id === preview.binding_id); const route = profile.available_routes.find((item) => binding && bindingMatchesRoute(binding, item)); return <article key={preview.id}><OperatorIconButton label={isPlaying ? "Pause voice test" : "Play voice test"} disabled={preview.status !== "ready"} onClick={() => preview.filename && void player.toggleSource({ key: `voice-preview:${preview.id}`, url: audioUrl(preview.filename), title: profile.name, subtitle: preview.tag || route?.label || preview.model_id, kind: "voice" })}>{isPlaying ? <Pause /> : <Play />}</OperatorIconButton><div><b>{preview.tag || "Natural reading"}</b><p>{preview.text}</p><small>{route ? routeLabel(route) : preview.model_id}</small></div><span className={cn("voice-preview-state", preview.status)}>{preview.status === "ready" ? "Ready" : preview.status === "failed" ? "Failed" : "Creating…"}</span></article> })}{!previews.length && <div className="voice-profile-empty compact"><Sparkles /><h3>No tests for this method yet</h3><p>Create one useful listening sample for this recording method.</p></div>}</div>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  </DialogContent></Dialog>
}
