import { AudioLines, CircleDollarSign, Gauge, Mic2, Plus, Settings2, WandSparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { VoicePicker } from "@/components/voice-picker"
import { useComposerText, type TextView } from "@/hooks/use-composer-text"
import { resolveVoice } from "@/lib/voice"
import { getVoiceOptions, type VoiceChoice } from "@/lib/voice-options"
import { cn } from "@/lib/utils"
import type { ClonedVoice, GeneratePayload, GenerateResult, PlayerSource, ProductionPart, StudioConfig, VoiceDirectory } from "@/types/domain"

type ComposerSection = "script" | "voice" | "delivery" | "output"

export function SpeechTool({ projectId, nextPartNumber = 1, insertAt = null, part = null, config, directory, playingKey, playerPlaying, onSave, onGenerate, onPlay }: {
  projectId?: number
  nextPartNumber?: number
  insertAt?: number | null
  part?: ProductionPart | null
  config: StudioConfig | null
  clonedVoices: ClonedVoice[]
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onSave?: (payload: Omit<GeneratePayload, "confirmed">) => Promise<void>
  onGenerate: (payload: GeneratePayload) => Promise<GenerateResult>
  onPlay: (source: PlayerSource) => void
}) {
  const [engine, setEngine] = useState<"audio" | "omni">((part?.engine as "audio" | "omni") || "audio")
  const textSession = useComposerText(part, projectId || 0, engine)
  const [section, setSection] = useState<ComposerSection>("voice")
  const [model, setModel] = useState<"plus" | "flash">((part?.model as "plus" | "flash") || "plus")
  const [voice, setVoice] = useState(part?.voice || "")
  const [language, setLanguage] = useState(part?.language || "Auto")
  const [format, setFormat] = useState(part?.format || "mp3")
  const [speechMode, setSpeechMode] = useState<"exact" | "directed">((part?.speech_mode as "exact" | "directed") || "exact")
  const [instruction, setInstruction] = useState(part?.instruction || "")
  const [rate, setRate] = useState(part?.rate ?? 1)
  const [pitch, setPitch] = useState(part?.pitch ?? 1)
  const [volume, setVolume] = useState(part?.volume ?? 50)
  const [busy, setBusy] = useState<"draft" | "generate" | null>(null)
  const [confirmEstimate, setConfirmEstimate] = useState<number | null>(null)
  const [pendingPayload, setPendingPayload] = useState<GeneratePayload | null>(null)
  const [pendingVoiceRoute, setPendingVoiceRoute] = useState<VoiceChoice | null>(null)

  useEffect(() => {
    setSection("voice")
    setEngine((part?.engine as "audio" | "omni") || "audio"); setModel((part?.model as "plus" | "flash") || "plus"); setVoice(part?.voice || "")
    setLanguage(part?.language || "Auto"); setFormat(part?.format || "mp3"); setSpeechMode((part?.speech_mode as "exact" | "directed") || "exact")
    setInstruction(part?.instruction || ""); setRate(part?.rate ?? 1); setPitch(part?.pitch ?? 1); setVolume(part?.volume ?? 50)
  }, [part?.id])

  const voices = useMemo(() => {
    return getVoiceOptions(directory.registry ?? null, engine, model)
  }, [directory.registry, engine, model])

  useEffect(() => {
    if (!config) return
    const next = voices.compatible[0]?.id || ""
    if (!voices.compatible.some((item) => item.id === voice)) setVoice(next)
  }, [config, engine, model, voice, voices])
  useEffect(() => {
    if (part || !/[\u0600-\u06ff]/.test(textSession.text)) return
    setEngine("omni"); setLanguage("Arabic")
  }, [part, textSession.text])

  const estimateRate = config?.capabilities[engine]?.estimate_rates_per_million_chars?.[model] || 0
  const capability = config?.capabilities[engine]
  const documentedTags = new Set([
    ...Object.values(config?.tags || {}).flatMap((group) => Array.isArray(group) ? group : Object.keys(group)),
    ...(Array.isArray(config?.retired_tags) ? config.retired_tags : Object.keys(config?.retired_tags || {})),
  ].map((tag) => tag.toLocaleLowerCase()))
  const hasInlineDeliveryTag = Array.from(textSession.text.matchAll(/\[([^\[\]]{1,40})\]/g))
    .some((match) => documentedTags.has((match[1] || "").toLocaleLowerCase()))
  const taggedIncompatible = engine === "omni" && (textSession.view === "tagged" || hasInlineDeliveryTag)
  const estimate = textSession.text.length * estimateRate / 1_000_000
  const destination = !projectId ? "Standalone recording" : part ? part.kind === "draft" ? `Record Part ${(part.position ?? 0) + 1}` : `New take for Part ${(part.position ?? 0) + 1}` : insertAt === null ? `New Part ${nextPartNumber}` : `Insert as Part ${insertAt + 1}`
  function payload(confirmed = false): GeneratePayload {
    const binding = directory.registry?.bindings.find((item) => item.provider_voice_id === voice)
    const identityId = binding?.source === "custom" ? binding.identity_id : part?.voice === voice ? part.voice_identity_id : null
    return { text: textSession.text, text_raw: textSession.states.raw || null, text_shaped: textSession.states.shaped || null, text_tagged: textSession.states.tagged || null, text_state: textSession.view, ...(projectId ? { production_id: projectId } : {}), insert_at: insertAt, voice, voice_identity_id: identityId, engine, model, format, language, instruction, speech_mode: engine === "omni" ? speechMode : "exact", rate, pitch, volume, seed: part?.seed ?? 0, confirmed }
  }
  async function generate(next = payload()) {
    const warnAbove = Number(config?.prefs?.warn_above || 0)
    if (!next.confirmed && warnAbove > 0 && estimate > warnAbove) { setPendingPayload(next); setConfirmEstimate(estimate); return }
    setBusy("generate")
    try { const result = await onGenerate(next); if (result.needs_confirmation) { setPendingPayload(next); setConfirmEstimate(result.estimate || estimate) } }
    catch { /* The Production-owned render task keeps the actionable failure. */ }
    finally { setBusy(null) }
  }
  function applyVoiceLanguage(choice: VoiceChoice) {
    if (choice.languages.length === 1) setLanguage(choice.languages[0] || "Auto")
    else if (language !== "Auto" && !choice.languages.some((item) => item.toLocaleLowerCase() === language.toLocaleLowerCase())) setLanguage(choice.languages[0] || "Auto")
  }

  const routeModels = directory.registry?.models || []
  const engineOptions = Array.from(new Set(routeModels.map((route) => route.engine)))
  const tierOptions = routeModels.filter((route) => route.engine === engine)
  const performancePresets = (directory.registry?.presets || []).filter((preset) => preset.engines.includes(engine))

  const nav: Array<{ key: ComposerSection; label: string; detail: string; icon: typeof AudioLines }> = [
    { key: "voice", label: "Voice", detail: voice ? resolveVoice(voice, directory).name : "Choose a voice", icon: Mic2 },
    { key: "script", label: "Script", detail: textSession.text ? `${textSession.text.length} characters` : "Write the words", icon: AudioLines },
    { key: "delivery", label: "Delivery", detail: engine === "omni" ? speechMode === "exact" ? "Script priority" : "Directed performance" : "Exact TTS + tags", icon: WandSparkles },
    { key: "output", label: "Output", detail: `${format.toUpperCase()} · ${rate.toFixed(2)}×`, icon: Gauge },
  ]

  return <div className="speech-composer">
    <aside className="composer-nav" aria-label="Composer sections"><span className="destination-note">{destination}</span>{nav.map(({ key, label, detail, icon: Icon }) => <button key={key} className={cn(section === key && "active")} onClick={() => setSection(key)}><Icon /><span><b>{label}</b><small>{detail}</small></span></button>)}</aside>
    <div className="composer-stage">
      {section === "script" && <section className="composer-section script-section"><header><div><span className="eyebrow">Words and text states</span><h3>What should be said?</h3></div><div className="speech-states">{(["raw", "shaped", ...(capability?.inline_tags ? ["tagged" as const] : [])] as TextView[]).map((state) => <Button key={state} variant="ghost" size="sm" className={textSession.view === state ? "active" : ""} disabled={state !== "raw" && !textSession.states[state]} onClick={() => textSession.select(state)}>{state === "raw" ? "Raw" : state === "shaped" ? "Spoken" : "Tagged"}</Button>)}</div></header>{taggedIncompatible && <div className="composer-warning"><b>Tagged delivery is not available with Qwen 3.5 Omni.</b><span>Choose the Spoken or Raw script. Omni uses one natural-language direction instead.</span><div>{textSession.states.shaped && <Button size="sm" variant="outline" onClick={() => textSession.select("shaped")}>Use Spoken version</Button>}<Button size="sm" variant="outline" onClick={() => textSession.select("raw")}>Use Raw version</Button></div></div>}<Textarea dir="auto" value={textSession.text} onChange={(event) => textSession.updateText(event.target.value)} placeholder="Type or paste what should be said…" autoFocus />
        <div className="text-pass-actions"><Button variant="outline" disabled={!textSession.text.trim() || Boolean(textSession.busy)} onClick={() => void textSession.run("shape")}><AudioLines />{textSession.busy === "shape" ? "Rewriting…" : "Make it spoken"}</Button>{capability?.inline_tags ? <><Select value={textSession.density} onValueChange={textSession.setDensity}><SelectTrigger aria-label="Tag density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light tags</SelectItem><SelectItem value="normal">Normal tags</SelectItem><SelectItem value="heavy">Heavy tags</SelectItem></SelectContent></Select><Button variant="outline" disabled={!textSession.text.trim() || Boolean(textSession.busy)} onClick={() => void textSession.run("tag")}><WandSparkles />{textSession.busy === "tag" ? "Tagging…" : "Add delivery tags"}</Button></> : <p className="composer-engine-note">Omni does not use inline tags. Set its overall performance in Delivery.</p>}</div>
        {textSession.error && <p className="composer-warning">{textSession.error}</p>}
        {textSession.review && <div className="text-review"><header><div><b>{textSession.review.kind === "shape" ? "Spoken version ready" : "Tagged version ready"}</b><span>${Number(textSession.review.result.cost || 0).toFixed(4)} · review before accepting</span></div><div><Button variant="ghost" onClick={textSession.reject}>Reject</Button><Button onClick={() => void textSession.accept()}>Accept version</Button></div></header><p>{textSession.review.result.difference?.map((change, index) => change.kind === "added" ? <ins key={index}>{change.text}</ins> : change.kind === "removed" ? <del key={index}>{change.text}</del> : <span key={index}>{change.text}</span>)}</p></div>}
      </section>}
      {section === "voice" && <section className="composer-section"><header><div><span className="eyebrow">Voice and model</span><h3>Who should speak?</h3></div></header><div className="composer-route-grid"><label><span>Engine</span><Select value={engine} onValueChange={(value) => setEngine(value as "audio" | "omni")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{engineOptions.map((item) => { const routes = routeModels.filter((route) => route.engine === item); return <SelectItem key={item} value={item}>{routes[0]?.label || item}</SelectItem> })}</SelectContent></Select></label><label><span>Model</span><Select value={model} onValueChange={(value) => setModel(value as "plus" | "flash")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tierOptions.map((route) => <SelectItem key={route.model_id} value={route.tier}>{route.tier === "plus" ? "Plus" : "Flash"} · {route.total_count} voices</SelectItem>)}</SelectContent></Select></label><label className="wide"><span>Voice</span><VoicePicker choices={voices.choices} summary={voices.summary} value={voice} directory={directory} engineLabel={voices.summary?.label || engine} modelLabel={model === "plus" ? "Plus" : "Flash"} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onChange={(choice) => { if (choice.compatible) { setVoice(choice.id); applyVoiceLanguage(choice) } else setPendingVoiceRoute(choice) }} /></label><label><span>Language</span><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(config?.languages || []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label></div>{voices.summary && <p className="composer-registry-note">{voices.summary.system_count} Alibaba voices · {voices.summary.custom_count} of your voices · catalogue verified {directory.registry?.source.verified_at}</p>}</section>}
      {section === "delivery" && <section className="composer-section"><header><div><span className="eyebrow">Performance</span><h3>How should it sound?</h3></div></header>{engine === "omni" && <div className="delivery-mode"><div><span>Mode</span><Button variant={speechMode === "exact" ? "secondary" : "outline"} onClick={() => setSpeechMode("exact")}>Script priority</Button><Button variant={speechMode === "directed" ? "secondary" : "outline"} onClick={() => setSpeechMode("directed")}>Directed performance</Button></div><p>{speechMode === "exact" ? "Requests a verbatim response and checks Alibaba's returned transcript. Omni can still deviate." : "Uses one overall direction and checks the returned transcript. Per-sentence tags are unavailable."}</p></div>}<label><span>{engine === "omni" ? "Overall performance direction" : "Voice direction"}</span><Input value={instruction} disabled={engine === "omni" && speechMode === "exact"} maxLength={config?.instruction_max || 100} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the performance in natural language" />{engine === "omni" && speechMode === "exact" && <small>Switch to Directed performance to apply a natural-language direction.</small>}</label>{performancePresets.length > 0 && <div className="performance-presets"><span>Presets</span><div>{performancePresets.map((preset) => <Button key={preset.id} type="button" variant={instruction === preset.instruction ? "secondary" : "outline"} onClick={() => { setInstruction(preset.instruction); if (engine === "omni") setSpeechMode("directed") }}><b>{preset.name}</b><small>{preset.instruction}</small></Button>)}</div></div>}</section>}
      {section === "output" && <section className="composer-section"><header><div><span className="eyebrow">Fine controls</span><h3>Output and voice tuning</h3></div></header><div className="composer-fine-grid"><label><span>Speed <b>{rate.toFixed(2)}×</b></span><Slider value={[rate]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => setRate(value)} /></label><label><span>Pitch <b>{pitch.toFixed(2)}×</b></span><Slider value={[pitch]} min={0.5} max={2} step={0.05} onValueChange={([value = 1]) => setPitch(value)} /></label><label><span>Volume <b>{volume}</b></span><Slider value={[volume]} min={0} max={100} step={1} onValueChange={([value = 50]) => setVolume(value)} /></label><label><span>File type</span><Select value={format} onValueChange={setFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(config?.formats || ["mp3"]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label></div></section>}
    </div>
    <footer className="composer-footer"><div className="composer-cost"><CircleDollarSign /><span>{textSession.text.length.toLocaleString()} characters</span><b>about ${estimate.toFixed(4)}</b></div><div className="composer-actions">{!part && projectId && onSave && <Button variant="outline" disabled={!textSession.text.trim() || !voice || Boolean(busy)} onClick={async () => { setBusy("draft"); try { await onSave(payload()); } finally { setBusy(null) } }}><Plus />{busy === "draft" ? "Saving…" : "Save as draft"}</Button>}<Button disabled={!config?.has_key || !textSession.text.trim() || !voice || Boolean(busy) || taggedIncompatible} onClick={() => void generate()}><WandSparkles />{busy === "generate" ? "Generating…" : !projectId ? "Generate audio" : part?.kind === "draft" ? `Record Part ${(part.position ?? 0) + 1}` : part ? `Generate new take · Part ${(part.position ?? 0) + 1}` : `Generate and add Part ${insertAt === null ? nextPartNumber : insertAt + 1}`}</Button></div></footer>
    {!config?.has_key && <p className="composer-warning footer-warning">Add the Alibaba API key in Settings before generating. Drafts still work.</p>}
    <Dialog open={confirmEstimate !== null} onOpenChange={(open) => { if (!open) { setConfirmEstimate(null); setPendingPayload(null) } }}><DialogContent><DialogHeader><DialogTitle>Generate this take?</DialogTitle><DialogDescription>This request is estimated at ${confirmEstimate?.toFixed(4)}. Actual provider usage is stored after completion.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { setConfirmEstimate(null); setPendingPayload(null) }}>Cancel</Button><Button onClick={() => { const next = pendingPayload; setConfirmEstimate(null); setPendingPayload(null); if (next) void generate({ ...next, confirmed: true }) }}>Generate</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(textSession.pending)} onOpenChange={(open) => { if (!open) textSession.cancelPending() }}><DialogContent><DialogHeader><DialogTitle>Run this text pass?</DialogTitle><DialogDescription>This Alibaba rewrite is estimated at ${Number(textSession.pending?.estimate || 0).toFixed(4)}. You will review the result before accepting it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={textSession.cancelPending}>Cancel</Button><Button onClick={() => void textSession.confirmPending()}>Continue</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(pendingVoiceRoute)} onOpenChange={(open) => { if (!open) setPendingVoiceRoute(null) }}><DialogContent><DialogHeader><DialogTitle>Switch voice setup?</DialogTitle><DialogDescription>{pendingVoiceRoute ? `${resolveVoice(pendingVoiceRoute.id, directory).name} requires ${pendingVoiceRoute.engine === "omni" ? "Qwen 3.5 Omni" : "Qwen Audio TTS"} · ${pendingVoiceRoute.model === "plus" ? "Plus" : "Flash"}. The Composer will change those two settings, then select the voice.` : ""}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingVoiceRoute(null)}>Keep current setup</Button><Button onClick={() => { if (!pendingVoiceRoute) return; setEngine(pendingVoiceRoute.engine); setModel(pendingVoiceRoute.model); setVoice(pendingVoiceRoute.id); applyVoiceLanguage(pendingVoiceRoute); setPendingVoiceRoute(null) }}>Switch and use voice</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
