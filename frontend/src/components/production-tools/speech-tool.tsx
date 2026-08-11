import { AudioLines, CircleDollarSign, Gauge, Mic2, Plus, WandSparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { VoicePicker } from "@/components/voice-picker"
import { VoiceLanguageSupport } from "@/components/voice-language-support"
import { VoiceMethodPicker } from "@/components/production-tools/voice-method-picker"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { useComposerText, type TextView } from "@/hooks/use-composer-text"
import { useComposerDraftRecovery } from "@/hooks/use-composer-draft-recovery"
import {
  buildSpeechCommand,
  compositionContext,
  editorialBaseline,
  resolveSelectedRoute,
  recoverableDraft,
  routeSelection,
  routeSelectionFromPersistedDraft,
  routeSelectionId,
  toGeneratePayload,
  type ComposerUI,
  type CompositionDraft,
  type SpeechGenerationCommand,
} from "@/lib/composer-contract"
import { capabilityTitle, outputLanguageOptions } from "@/lib/voice-capabilities"
import { formatMicroMoney } from "@/lib/format"
import { getVoiceIdentities, routesForIdentity, type SpeechEngine, type SpeechModel, type VoiceChoice, type VoiceIdentityChoice } from "@/lib/voice-options"
import { cn } from "@/lib/utils"
import type { ClonedVoice, DurableJob, GeneratePayload, GenerateResult, PlayerSource, ProductionCastRole, ProductionPart, StudioConfig, VoiceDirectory } from "@/types/domain"

type ComposerSection = "script" | "voice" | "delivery" | "output"

function tierLabel(model: SpeechModel) {
  return model === "vc" ? "Voice Clone" : model === "plus" ? "Plus" : "Flash"
}

function engineLabel(engine: SpeechEngine) {
  return engine === "qwen_tts" ? "Qwen3 TTS Voice Clone" : engine === "omni" ? "Qwen 3.5 Omni" : "Qwen Audio TTS"
}

export function SpeechTool({ projectId, sessionId, nextPartNumber = 1, insertAt = null, insertBeforePartId = null, part = null, config, directory, cast = [], playingKey, playerPlaying, onSave, onUpdateEditorial, onGenerate, onPlay }: {
  projectId?: number
  sessionId?: string
  nextPartNumber?: number
  insertAt?: number | null
  insertBeforePartId?: string | null
  part?: ProductionPart | null
  config: StudioConfig | null
  clonedVoices: ClonedVoice[]
  directory: VoiceDirectory
  cast?: ProductionCastRole[]
  playingKey?: string
  playerPlaying: boolean
  onSave?: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onUpdateEditorial?: (values: { expected_revision: number; script?: string; cast_role_id?: string | null }) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<DurableJob<GenerateResult>>
  onPlay: (source: PlayerSource) => void
}) {
  const [route, setRoute] = useState(routeSelectionFromPersistedDraft(part))
  const [identityId, setIdentityId] = useState(part?.voice_identity_id || "")
  const [castRoleId, setCastRoleId] = useState(part?.cast_role_id || "")
  const [language, setLanguage] = useState(part?.language || "Auto")
  const [format, setFormat] = useState(part?.format || "mp3")
  const [speechMode, setSpeechMode] = useState<"exact" | "directed">((part?.speech_mode as "exact" | "directed") || "exact")
  const [instruction, setInstruction] = useState(part?.instruction || "")
  const [rate, setRate] = useState(part?.rate ?? 1)
  const [pitch, setPitch] = useState(part?.pitch ?? 1)
  const [volume, setVolume] = useState(part?.volume ?? 50)
  const [ui, setUI] = useState<ComposerUI>({ section: "voice", busy: null, confirmationEstimate: null })
  const [pendingCommand, setPendingCommand] = useState<{ command: SpeechGenerationCommand; selectResult: boolean; updateEditorial: boolean } | null>(null)
  const [editorialCommand, setEditorialCommand] = useState<SpeechGenerationCommand | null>(null)
  const { section, busy, confirmationEstimate: confirmEstimate } = ui
  const setSection = (section: ComposerSection) => setUI((current) => ({ ...current, section }))
  const setBusy = (busy: ComposerUI["busy"]) => setUI((current) => ({ ...current, busy }))
  const setConfirmEstimate = (confirmationEstimate: number | null) => setUI((current) => ({ ...current, confirmationEstimate }))

  useEffect(() => {
    setUI({ section: "voice", busy: null, confirmationEstimate: null })
    setPendingCommand(null); setEditorialCommand(null)
    setRoute(routeSelectionFromPersistedDraft(part)); setIdentityId(part?.voice_identity_id || ""); setCastRoleId(part?.cast_role_id || "")
    setLanguage(part?.language || "Auto"); setFormat(part?.format || "mp3"); setSpeechMode((part?.speech_mode as "exact" | "directed") || "exact")
    setInstruction(part?.instruction || ""); setRate(part?.rate ?? 1); setPitch(part?.pitch ?? 1); setVolume(part?.volume ?? 50)
  }, [part?.id])

  const identities = useMemo(() => getVoiceIdentities(directory.registry ?? null, directory.identities), [directory.identities, directory.registry])
  const selectedIdentity = identities.find((identity) => identity.identityId === identityId)
  const outputLanguage = language
  const compatibleRoutes = useMemo(
    () => routesForIdentity(selectedIdentity, outputLanguage),
    [outputLanguage, selectedIdentity],
  )
  const selectedRoute = selectedIdentity?.routes.find((item) => item.id === routeSelectionId(route))
  const currentRoute = resolveSelectedRoute(route, compatibleRoutes)
  const engine = currentRoute?.engine || null
  const model = currentRoute?.model || null
  const textSession = useComposerText(part, projectId, engine)
  const languageOptions = outputLanguageOptions(config, selectedIdentity)

  function applyRoute(nextRoute: VoiceChoice | undefined, capabilityId?: string | null) {
    if (!nextRoute) { setRoute(null); return }
    setRoute(routeSelection(nextRoute, capabilityId))
  }

  function selectIdentity(identity: VoiceIdentityChoice) {
    setIdentityId(identity.identityId)
    setRoute(null)
    const role = cast.find((item) => item.id === castRoleId)
    const matchesIdentity = role?.voice_identity_id === identity.identityId
    const matchesCatalogue = Boolean(role?.catalogue_voice_id &&
      identity.routes.some((route) =>
        route.catalogueVoiceId === role.catalogue_voice_id))
    if (role && !matchesIdentity && !matchesCatalogue) setCastRoleId("")
  }

  function selectCastRole(roleId: string) {
    setCastRoleId(roleId === "none" ? "" : roleId)
    const role = cast.find((item) => item.id === roleId)
    if (!role) return
    if (role.voice_identity_id) {
      setIdentityId(role.voice_identity_id)
      setRoute(null)
      return
    }
    if (role.catalogue_voice_id) {
      const identity = identities.find((item) => item.routes.some(
        (route) => route.catalogueVoiceId === role.catalogue_voice_id))
      if (identity) {
        setIdentityId(identity.identityId)
        setRoute(null)
      }
    }
  }

  useEffect(() => {
    if (!identities.length) return
    if (!identityId) {
      const partBinding = part?.binding_id || part?.catalogue_voice_id
        ? directory.registry?.bindings.find((item) =>
          Boolean(part.binding_id && item.binding_id === part.binding_id)
          || Boolean(part.catalogue_voice_id && item.catalogue_voice_id === part.catalogue_voice_id))
        : undefined
      const explicit = identities.find((item) => item.identityId === (part?.voice_identity_id || partBinding?.identity_id))
      if (explicit) setIdentityId(explicit.identityId)
      return
    }
    if (!selectedIdentity) {
      const partBinding = part?.binding_id || part?.catalogue_voice_id
        ? directory.registry?.bindings.find((item) =>
          Boolean(part.binding_id && item.binding_id === part.binding_id)
          || Boolean(part.catalogue_voice_id && item.catalogue_voice_id === part.catalogue_voice_id))
        : undefined
      const explicit = identities.find((item) => item.identityId === (part?.voice_identity_id || partBinding?.identity_id))
      if (explicit) setIdentityId(explicit.identityId)
      return
    }
    if (!selectedRoute) setRoute(null)
  // `applyRoute` is intentionally an atomic state transition, not an effect dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory.registry?.bindings, identities, identityId, part?.binding_id, part?.catalogue_voice_id, part?.voice_identity_id, selectedIdentity, selectedRoute])

  const estimateRate = engine && model ? config?.capabilities[engine]?.estimate_rates_per_million_chars?.[model] || 0 : 0
  const capability = engine ? config?.capabilities[engine] : undefined
  const documentedTags = new Set([
    ...Object.values(config?.tags || {}).flatMap((group) => Array.isArray(group) ? group : Object.keys(group)),
    ...(Array.isArray(config?.retired_tags) ? config.retired_tags : Object.keys(config?.retired_tags || {})),
  ].map((tag) => tag.toLocaleLowerCase()))
  const hasInlineDeliveryTag = Array.from(textSession.text.matchAll(/\[([^\[\]]{1,40})\]/g))
    .some((match) => documentedTags.has((match[1] || "").toLocaleLowerCase()))
  const taggedIncompatible = capability?.inline_tags === false && (textSession.view === "tagged" || hasInlineDeliveryTag)
  const removeInlineTags = () => textSession.updateText(textSession.text.replace(/\[([^\[\]]{1,40})\]\s*/g, (match, tag: string) => documentedTags.has(tag.toLocaleLowerCase()) ? "" : match))
  const estimate = textSession.text.length * estimateRate / 1_000_000
  const textPassEstimate = textSession.text.length * Number(config?.text_preparation?.estimated_price_per_million_characters || 0) / 1_000_000
  const destination = !projectId ? "Standalone recording" : part ? part.kind === "draft" ? `Record Part ${(part.position ?? 0) + 1}` : `New take for Part ${(part.position ?? 0) + 1}` : insertAt === null ? `New Part ${nextPartNumber}` : `Insert as Part ${insertAt + 1}`
  const context = useMemo(() => compositionContext({ productionId: projectId, part, insertAt, insertBeforePartId, sessionId }), [insertAt, insertBeforePartId, part, projectId, sessionId])
  const baseline = useMemo(() => editorialBaseline(part), [part])
  const draft: CompositionDraft = {
    voiceIdentityId: selectedIdentity?.source === "mine" ? selectedIdentity.identityId : null,
    castRoleId: castRoleId || null,
    route,
    text: { raw: textSession.states.raw, shaped: textSession.states.shaped, tagged: textSession.states.tagged, active: textSession.view },
    delivery: { modeId: engine === "omni" ? speechMode : "exact", instruction, rate, pitch, volume, seed: part?.seed ?? 0 },
    output: { format, language: outputLanguage || "Auto" },
    editorialPatch: {
      ...(baseline && textSession.states.raw !== baseline.script ? { script: textSession.states.raw } : {}),
      ...(baseline && (castRoleId || null) !== baseline.castRoleId ? { castRoleId: castRoleId || null } : {}),
    },
  }
  const recovery = useComposerDraftRecovery({
    context,
    draft: recoverableDraft(draft),
    onRestore: (saved) => {
      setIdentityId(saved.voiceIdentityId || "")
      setCastRoleId(saved.castRoleId || "")
      setRoute(saved.route)
      textSession.restore(saved.text)
      setSpeechMode(saved.delivery.modeId === "directed" ? "directed" : "exact")
      setInstruction(saved.delivery.instruction)
      setRate(saved.delivery.rate)
      setPitch(saved.delivery.pitch)
      setVolume(saved.delivery.volume)
      setFormat(saved.output.format)
      setLanguage(saved.output.language)
    },
    enabled: context.kind === "production" || Boolean(context.sessionId),
  })
  function command(confirmed = false) {
    return buildSpeechCommand({ context, draft, confirmed })
  }
  function payload(nextCommand = command()): GeneratePayload {
    if (!currentRoute) throw new Error("Choose an exact recording route before generating.")
    return toGeneratePayload(nextCommand, currentRoute)
  }
  async function executeGeneration(next: SpeechGenerationCommand, selectResult: boolean, updateEditorial: boolean) {
    setBusy("generate")
    try {
      if (updateEditorial && baseline && onUpdateEditorial) {
        await onUpdateEditorial({ expected_revision: baseline.revision, ...next.editorialPatch })
      }
      await onGenerate({ ...payload(next), select_result: selectResult })
      if (context.kind === "production") await recovery.clear()
    }
    catch { /* The Production-owned render task keeps the actionable failure. */ }
    finally { setBusy(null) }
  }
  function continueGeneration(next: SpeechGenerationCommand, selectResult: boolean, updateEditorial: boolean) {
    const warnAbove = Number(config?.prefs?.warn_above || 0)
    if (!next.confirmed && warnAbove > 0 && estimate > warnAbove) {
      setPendingCommand({ command: next, selectResult, updateEditorial })
      setConfirmEstimate(estimate)
      return
    }
    void executeGeneration(next, selectResult, updateEditorial)
  }
  function generate(next = command()) {
    if (baseline && Object.keys(next.editorialPatch).length) {
      setEditorialCommand(next)
      return
    }
    continueGeneration(next, true, false)
  }
  const performancePresets = engine ? (directory.registry?.presets || []).filter((preset) => preset.engines.includes(engine)) : []
  const selectedCapability = currentRoute?.capabilities.find((item) => item.id === route?.capabilityId)
    || (currentRoute?.capabilities.length === 1 ? currentRoute.capabilities[0] : null)
  const methodLabel = selectedCapability?.name || (engine ? capabilityTitle(engine, config) : "Choose a route first")

  const nav: Array<{ key: ComposerSection; label: string; detail: string; icon: typeof AudioLines }> = [
    { key: "voice", label: "Voice", detail: selectedIdentity?.name || "Choose a voice", icon: Mic2 },
    { key: "script", label: "Script", detail: textSession.text ? `${textSession.text.length} characters` : "Write the words", icon: AudioLines },
    { key: "delivery", label: "Delivery", detail: methodLabel, icon: WandSparkles },
    { key: "output", label: "Output", detail: engine && model ? `${engineLabel(engine)} · ${tierLabel(model)}` : "No route selected", icon: Gauge },
  ]

  return <div className="speech-composer">
    <aside className="composer-nav" aria-label="Composer sections"><span className="destination-note">{destination}</span>{nav.map(({ key, label, detail, icon: Icon }) => <button key={key} aria-label={`${label}: ${detail}`} className={cn(section === key && "active")} onClick={() => setSection(key)}><Icon /><span><b>{label}</b><small>{detail}</small></span></button>)}</aside>
    <div className="composer-stage">
      {section === "script" && <section className="composer-section script-section"><header><div><span className="eyebrow">Words and text states</span><h3>What should be said?</h3></div><div className="speech-states">{(["raw", "shaped", ...(capability?.inline_tags ? ["tagged" as const] : [])] as TextView[]).map((state) => <Button key={state} variant="ghost" size="sm" className={textSession.view === state ? "active" : ""} disabled={state !== "raw" && !textSession.states[state]} onClick={() => textSession.select(state)}>{state === "raw" ? "Raw" : state === "shaped" ? "Spoken" : "Tagged"}</Button>)}</div></header><div className="script-language-setting"><label><span>Language to speak</span><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><small>Auto leaves language detection to the selected model. Changing this never changes the voice or capability.</small></label>{currentRoute && <VoiceLanguageSupport compact route={currentRoute} language={outputLanguage} customVoice={selectedIdentity?.source === "mine"} />}</div>{engine && taggedIncompatible && <div className="composer-warning"><b>Inline tags are not available with {engineLabel(engine)}.</b><span>Your words stay untouched until you choose what to do.</span><div>{textSession.states.shaped && <Button size="sm" variant="outline" onClick={() => textSession.select("shaped")}>Use Spoken version</Button>}{hasInlineDeliveryTag && <Button size="sm" variant="outline" onClick={removeInlineTags}>Remove inline tags</Button>}</div></div>}<Textarea dir="auto" value={textSession.text} onChange={(event) => textSession.updateText(event.target.value)} placeholder="Type or paste what should be said…" autoFocus />
        <div className="text-pass-actions"><Button variant="outline" disabled={!engine || !textSession.text.trim() || Boolean(textSession.busy)} onClick={() => void textSession.run("shape")}><AudioLines />{textSession.busy === "shape" ? "Rewriting…" : "Make it spoken"}</Button>{capability?.inline_tags ? <><Select value={textSession.density} onValueChange={textSession.setDensity}><SelectTrigger aria-label="Tag density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light tags</SelectItem><SelectItem value="normal">Normal tags</SelectItem><SelectItem value="heavy">Heavy tags</SelectItem></SelectContent></Select><Button variant="outline" disabled={!textSession.text.trim() || Boolean(textSession.busy)} onClick={() => void textSession.run("tag")}><WandSparkles />{textSession.busy === "tag" ? "Tagging…" : "Add delivery tags"}</Button></> : <p className="composer-engine-note">{engine ? `${engineLabel(engine)} does not use inline tags.` : "Choose an exact route to see its text tools."}</p>}<small className="text-pass-cost">Alibaba text pass · {config?.text_preparation?.model || "Qwen text"} · about {formatMicroMoney(textPassEstimate)} each</small></div>
        {textSession.error && <p className="composer-warning">{textSession.error}</p>}
        {textSession.review && <div className="text-review"><header><div><b>{textSession.review.kind === "shape" ? "Spoken version ready" : "Tagged version ready"}</b><span>{formatMicroMoney(Number(textSession.review.result.cost || 0))} · {textSession.review.result.cost_basis === "actual_tokens" ? "actual Alibaba tokens" : "estimated"} · review before accepting</span></div><div><Button variant="ghost" onClick={textSession.reject}>Reject</Button><Button onClick={() => void textSession.accept()}>Accept version</Button></div></header><p>{textSession.review.result.difference?.map((change, index) => change.kind === "added" ? <ins key={index}>{change.text}</ins> : change.kind === "removed" ? <del key={index}>{change.text}</del> : <span key={index}>{change.text}</span>)}</p></div>}
      </section>}
      {section === "voice" && <section className="composer-section voice-capability-section"><header><div><span className="eyebrow">Voice and capability</span><h3>Choose who speaks and the exact recording route</h3></div></header><div className="composer-route-grid voice-first-grid">{projectId && cast.length > 0 && <label className="wide"><span>Cast role</span><Select value={castRoleId || "none"} onValueChange={selectCastRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No Cast Role</SelectItem>{cast.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}{role.persona_name ? ` · ${role.persona_name}` : ""}</SelectItem>)}</SelectContent></Select><small>Selecting a role applies its assigned voice identity, but never chooses a provider binding for you.</small></label>}<label className="wide"><span>Voice</span><VoicePicker identities={identities} value={identityId} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onChange={selectIdentity} />{selectedIdentity?.editorialLanguage && <small className="voice-source-note">The flag is a team casting tag. It never limits this voice.</small>}</label></div><div className="method-heading"><b>Capability and exact model</b><span>Choose one exact provider binding. Audio Studio never picks one for you.</span></div>{selectedIdentity?.routes.length ? <VoiceMethodPicker routes={selectedIdentity.routes} availableRoutes={compatibleRoutes} selectedRouteId={routeSelectionId(route)} selectedCapabilityId={route?.capabilityId || null} language={outputLanguage} customVoice={selectedIdentity.source === "mine"} config={config} onSelect={applyRoute} /> : <div className="composer-warning capability-empty"><b>{selectedIdentity ? "This voice has no ready capability." : "Choose a voice to see its exact routes."}</b><span>{selectedIdentity ? "Open Voices to create its provider model versions." : "No voice or model is selected automatically."}</span></div>}{currentRoute && <div className="composer-registry-note"><b>Selected setup</b><span>{selectedIdentity?.name} · {outputLanguage}</span><SpeechModelIdentity engine={currentRoute.engine} tier={currentRoute.model} modelId={currentRoute.modelId} config={config} /></div>}</section>}
      {section === "delivery" && <section className="composer-section"><header><div><span className="eyebrow">Performance</span><h3>How should it sound?</h3></div></header>{engine === "omni" && <div className="delivery-mode"><div><span>Omni delivery</span><Button variant={speechMode === "exact" ? "secondary" : "outline"} onClick={() => setSpeechMode("exact")}>Keep the script</Button><Button variant={speechMode === "directed" ? "secondary" : "outline"} onClick={() => setSpeechMode("directed")}>Add direction</Button></div><p>{speechMode === "exact" ? "Audio Studio reads the script in short passages and verifies every returned transcript before assembling the Take." : "The same verified-passage process is used with one overall natural-language direction. Inline emotion tags are unavailable."}</p></div>}{engine === "qwen_tts" ? <p className="composer-engine-note">Faithful narration reads the prepared script without emotion tags or performance instructions.</p> : <label><span>{engine === "omni" ? "Overall performance direction" : "Voice direction"}</span><Input value={instruction} disabled={engine === "omni" && speechMode === "exact"} maxLength={config?.instruction_max || 100} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the performance in natural language" />{engine === "omni" && speechMode === "exact" && <small>Choose Add direction to control the overall performance.</small>}</label>}{performancePresets.length > 0 && <div className="performance-presets"><span>Presets</span><div>{performancePresets.map((preset) => <Button key={preset.id} type="button" variant={instruction === preset.instruction ? "secondary" : "outline"} onClick={() => { setInstruction(preset.instruction); if (engine === "omni") setSpeechMode("directed") }}><b>{preset.name}</b><small>{preset.instruction}</small></Button>)}</div></div>}</section>}
      {section === "output" && <section className="composer-section"><header><div><span className="eyebrow">Output</span><h3>{engine === "audio" ? "Output and voice tuning" : "File settings"}</h3></div></header>{!engine ? <p className="composer-engine-note">Choose an exact route before configuring model-specific output.</p> : engine !== "audio" && <p className="composer-engine-note">{engine === "omni" ? "Qwen 3.5 Omni interprets pace, emotion, and volume from the natural-language direction in Delivery." : "Qwen3 TTS Voice Clone controls delivery from the cloned voice and prepared script."} Precise numeric speed, pitch, and volume controls are unavailable.</p>}<div className="composer-fine-grid">{engine === "audio" && <><label><span>Speed <b>{rate.toFixed(2)}×</b></span><Slider value={[rate]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => setRate(value)} /></label><label><span>Pitch <b>{pitch.toFixed(2)}×</b></span><Slider value={[pitch]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => setPitch(value)} /></label><label><span>Volume <b>{volume}</b></span><Slider value={[volume]} min={0} max={100} step={1} onValueChange={([value = 50]) => setVolume(value)} /></label></>}<label><span>File type</span><Select value={format} onValueChange={setFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(config?.formats || ["mp3"]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label></div></section>}
    </div>
    <footer className="composer-footer"><div className="composer-cost"><CircleDollarSign /><span>{engine && taggedIncompatible ? `${capabilityTitle(engine, config)} does not use inline tags` : `${textSession.text.length.toLocaleString()} characters`}</span><b>{taggedIncompatible ? "Open Script to remove tags" : currentRoute ? `about $${estimate.toFixed(4)}` : "Choose an exact route"}</b>{recovery.status === "saving" && <small>Saving preparation…</small>}{recovery.status === "saved" && <small>Preparation saved</small>}{recovery.status === "conflict" && <small className="composer-save-error">Draft changed in another view</small>}{recovery.status === "error" && <small className="composer-save-error">Preparation could not be saved</small>}</div><div className="composer-actions">{!part && projectId && onSave && <Button variant="outline" disabled={!textSession.text.trim() || !currentRoute || Boolean(busy) || recovery.status === "loading"} onClick={async () => { setBusy("draft"); try { await onSave(payload()); await recovery.clear() } finally { setBusy(null) } }}><Plus />{busy === "draft" ? "Saving…" : "Save as draft"}</Button>}<Button disabled={!config?.has_key || !textSession.text.trim() || !currentRoute || Boolean(busy) || taggedIncompatible || recovery.status === "loading"} onClick={() => void generate()}><WandSparkles />{busy === "generate" ? "Generating…" : !projectId ? "Generate audio" : part?.kind === "draft" ? `Record Part ${(part.position ?? 0) + 1}` : part ? `Generate new take · Part ${(part.position ?? 0) + 1}` : `Generate and add Part ${insertAt === null ? nextPartNumber : insertAt + 1}`}</Button></div></footer>
    {!config?.has_key && <p className="composer-warning footer-warning">Add the Alibaba API key in Settings before generating. Drafts still work.</p>}
    <Dialog open={Boolean(editorialCommand)} onOpenChange={(open) => { if (!open) setEditorialCommand(null) }}><DialogContent><DialogHeader><DialogTitle>The Part has unsaved editorial changes</DialogTitle><DialogDescription>Choose whether these words and Cast Role become the Part’s new editorial truth. Audio Studio will never decide this for you.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { const next = editorialCommand; setEditorialCommand(null); if (next) continueGeneration(next, false, false) }}>Generate alternative only</Button><Button onClick={() => { const next = editorialCommand; setEditorialCommand(null); if (next) continueGeneration(next, true, true) }}>Update Part and generate</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={confirmEstimate !== null} onOpenChange={(open) => { if (!open) { setConfirmEstimate(null); setPendingCommand(null) } }}><DialogContent><DialogHeader><DialogTitle>Generate this take?</DialogTitle><DialogDescription>This request is estimated at ${confirmEstimate?.toFixed(4)}. Actual provider usage is stored after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { setConfirmEstimate(null); setPendingCommand(null) }}>Cancel</Button><Button onClick={() => { const next = pendingCommand; setConfirmEstimate(null); setPendingCommand(null); if (next) void executeGeneration({ ...next.command, confirmed: true }, next.selectResult, next.updateEditorial) }}>Generate</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(textSession.pending)} onOpenChange={(open) => { if (!open) textSession.cancelPending() }}><DialogContent><DialogHeader><DialogTitle>Run this text pass?</DialogTitle><DialogDescription>This Alibaba rewrite is estimated at ${Number(textSession.pending?.estimate || 0).toFixed(4)}. You will review the result before accepting it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={textSession.cancelPending}>Cancel</Button><Button onClick={() => void textSession.confirmPending()}>Continue</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
