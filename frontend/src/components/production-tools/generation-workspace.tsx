import { Check, ChevronDown, FileAudio, Pause, Play, RotateCcw, Sparkles, Trash2, X } from "lucide-react"
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { studioApi } from "@/lib/api"
import {
  compileAudioPrompt,
  type AudioGenerationBrief,
  type MusicGenerationBrief,
  type SfxGenerationBrief,
} from "@/lib/audio-generation-prompt"
import { formatDuration } from "@/lib/format"
import type {
  AudioAssetCategory,
  AudioAssetScope,
  AudioGenerationHistoryItem,
  GeneratedKeepResult,
  PlayerSource,
  VentureAsset,
} from "@/types/domain"

import type { AssetMode, GeneratedKeepInput } from "./asset-tool"

const CATEGORIES = [
  ["music", "Music"], ["ambience", "Ambience"], ["sfx", "SFX"],
  ["intro", "Intro"], ["outro", "Outro"], ["other", "Other"],
] as const

const EMPTY_MUSIC: MusicGenerationBrief = {
  purpose: "", mood: "", energy: "", instruments: "", tempo: "",
  texture: "", avoid: "", notes: "",
}
const EMPTY_SFX: SfxGenerationBrief = {
  object: "", action: "", location: "", perspective: "", character: "", avoid: "",
}

function candidateName(item: AudioGenerationHistoryItem) {
  const prompt = item.request.resolved_prompt || ""
  const concise = prompt.split(/[.!?]/)[0]?.replace(/^[^:]+:\s*/, "").trim().slice(0, 72)
  return concise || (item.request.capability === "music" ? "Generated music" : "Generated sound effect")
}

function briefFrom(item: AudioGenerationHistoryItem): AudioGenerationBrief {
  const raw = item.request.generation_brief || {}
  const source = typeof raw === "object" && raw ? raw as Record<string, unknown> : {}
  const value = (key: string) => typeof source[key] === "string" ? source[key] as string : ""
  return item.request.capability === "music" ? {
    purpose: value("purpose"), mood: value("mood"), energy: value("energy"),
    instruments: value("instruments"), tempo: value("tempo"), texture: value("texture"),
    avoid: value("avoid"), notes: value("notes"),
  } : {
    object: value("object"), action: value("action"), location: value("location"),
    perspective: value("perspective"), character: value("character"), avoid: value("avoid"),
  }
}

function isWorking(item: AudioGenerationHistoryItem) {
  return ["queued", "running", "retrying"].includes(item.status)
}

export function GenerationWorkspace({
  mode, productionId, playingKey, playerPlaying, onPlay, onKeep, onKept,
}: {
  mode: AssetMode
  productionId?: number
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onKeep: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
  onKept: (asset: VentureAsset, category: AudioAssetCategory, place: boolean) => Promise<void>
}) {
  const [capability, setCapability] = useState<"sfx" | "music">("sfx")
  const [promptMode, setPromptMode] = useState<"simple" | "expert">("simple")
  const [musicBrief, setMusicBrief] = useState<MusicGenerationBrief>(EMPTY_MUSIC)
  const [sfxBrief, setSfxBrief] = useState<SfxGenerationBrief>(EMPTY_SFX)
  const [expertPrompt, setExpertPrompt] = useState("")
  const [seconds, setSeconds] = useState(5)
  const [seed, setSeed] = useState("")
  const [history, setHistory] = useState<AudioGenerationHistoryItem[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<AudioAssetCategory>("sfx")
  const [scope, setScope] = useState<AudioAssetScope>("studio")
  const [tags, setTags] = useState<string[]>([])
  const [tagText, setTagText] = useState("")
  const [keeping, setKeeping] = useState<"place" | "library" | null>(null)
  const [discarding, setDiscarding] = useState(false)

  const brief = capability === "music" ? musicBrief : sfxBrief
  const resolvedPrompt = promptMode === "simple"
    ? compileAudioPrompt(capability, brief)
    : expertPrompt.trim().replace(/\s+/g, " ")
  const selected = history.find((item) => item.job_id === selectedJobId) || null
  const candidate = selected?.candidate || null
  const anyWorking = history.some(isWorking)

  const refreshHistory = useCallback(async () => {
    if (!productionId) return
    try {
      const recent = await studioApi.recentAudioGenerations(productionId)
      setHistory(recent)
      setSelectedJobId((current) => {
        if (current && recent.some((item) => item.job_id === current)) return current
        return recent.find((item) => item.candidate_available)?.job_id || recent[0]?.job_id || null
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recent candidates could not be loaded.")
    }
  }, [productionId])

  useEffect(() => { void refreshHistory() }, [refreshHistory])
  useEffect(() => {
    if (!anyWorking) return
    const timer = window.setInterval(() => void refreshHistory(), 1200)
    return () => window.clearInterval(timer)
  }, [anyWorking, refreshHistory])
  useEffect(() => {
    let current = true
    setStatus("checking")
    void studioApi.audioGenerationStatus().then((snapshot) => {
      if (!current) return
      const ready = capability === "sfx" ? snapshot.sfx_ready : snapshot.music_ready
      setStatus(ready ? "ready" : "unavailable")
      setReason(snapshot.reason || (ready ? "" : "That generator is unavailable."))
    }).catch((cause) => {
      if (!current) return
      setStatus("unavailable")
      setReason(cause instanceof Error ? cause.message : "Audio Generation is unavailable.")
    })
    return () => { current = false }
  }, [capability])
  useEffect(() => {
    setSeconds((value) => capability === "sfx"
      ? Math.max(1, Math.min(30, value))
      : Math.max(5, Math.min(120, value)))
    setCategory(capability === "sfx" ? "sfx" : "music")
  }, [capability])
  useEffect(() => {
    if (!selected) return
    setName(candidateName(selected))
    setCategory(selected.request.capability === "music" ? "music" : "sfx")
    setTags([])
  }, [selectedJobId]) // selected content is intentionally reset per candidate

  const updateBrief = (key: string, value: string) => {
    if (capability === "music") setMusicBrief((current) => ({ ...current, [key]: value }))
    else setSfxBrief((current) => ({ ...current, [key]: value }))
  }

  const generate = async (request?: AudioGenerationHistoryItem["request"], randomSeed = false) => {
    const requestedPrompt = request?.resolved_prompt || resolvedPrompt
    if (!requestedPrompt) { setError("Describe what should be heard."); return }
    const requestedSeed = randomSeed ? undefined : seed.trim() ? Number(seed) : request?.seed ?? undefined
    if (requestedSeed !== undefined && (!Number.isInteger(requestedSeed) || requestedSeed < 0 || requestedSeed > 2_147_483_647)) {
      setError("Seed must be a whole number between 0 and 2,147,483,647.")
      return
    }
    setGenerating(true); setError("")
    try {
      const sourceCapability = (request?.capability || capability) as "sfx" | "music"
      const sourceMode = (request?.prompt_mode || promptMode) as "simple" | "expert"
      const job = await studioApi.enqueueAudioGeneration({
        capability: sourceCapability,
        prompt: requestedPrompt,
        prompt_mode: sourceMode,
        generation_brief: sourceMode === "simple" ? (request?.generation_brief || brief) : undefined,
        authored_prompt: sourceMode === "expert" ? (request?.authored_prompt || requestedPrompt) : undefined,
        seconds: request?.seconds || seconds,
        seed: requestedSeed,
        production_id: productionId,
      })
      await refreshHistory()
      setSelectedJobId(job.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio could not be generated.")
    } finally { setGenerating(false) }
  }

  const refine = (item: AudioGenerationHistoryItem) => {
    const nextCapability = item.request.capability as "sfx" | "music"
    const nextMode = item.request.prompt_mode as "simple" | "expert"
    setCapability(nextCapability)
    setPromptMode(nextMode)
    setSeconds(item.request.seconds)
    setSeed(item.request.seed == null ? "" : String(item.request.seed))
    if (nextMode === "simple") {
      const restored = briefFrom(item)
      if (nextCapability === "music") setMusicBrief(restored as MusicGenerationBrief)
      else setSfxBrief(restored as SfxGenerationBrief)
    } else setExpertPrompt(item.request.authored_prompt || item.request.resolved_prompt)
    setError("")
  }

  const addTag = (raw = tagText) => {
    const next = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    if (!next || tags.includes(next)) { setTagText(""); return }
    if (next.length > 32 || tags.length >= 12) {
      setError(next.length > 32 ? "Keep each tag under 32 characters." : "Use at most 12 tags.")
      return
    }
    setTags((current) => [...current, next]); setTagText("")
  }

  const keep = async (place: boolean) => {
    if (!candidate || !name.trim()) return
    setKeeping(place ? "place" : "library"); setError("")
    try {
      const kept = await onKeep(category === "music" ? "Music" : category === "intro" ? "Intros" : category === "outro" ? "Outros" : "Stingers", {
        candidateId: candidate.candidate_id, name: name.trim(), category, scope, tags,
      })
      await refreshHistory()
      await onKept(kept.asset as VentureAsset, category, place)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That generated audio could not be kept.")
    } finally { setKeeping(null) }
  }

  const discard = async () => {
    if (!candidate) return
    setDiscarding(true); setError("")
    try {
      await studioApi.discardGeneratedAudio(candidate.candidate_id)
      await refreshHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That candidate could not be discarded.")
    } finally { setDiscarding(false) }
  }

  const fields: readonly (readonly [string, string, string])[] = capability === "music" ? [
    ["purpose", "Purpose / use", "Background for reflective narration"],
    ["mood", "Mood / feel", "Calm, hopeful, intimate"],
    ["energy", "Energy", "Low and steady"],
    ["instruments", "Instruments", "Soft piano, bowed strings"],
    ["tempo", "Tempo", "72 BPM or slow"],
    ["texture", "Texture", "Warm, spacious, organic"],
    ["avoid", "Avoid", "Vocals, dramatic rises"],
    ["notes", "Notes", "Leave room for spoken voice"],
  ] : [
    ["object", "Object / source", "Heavy wooden library door"],
    ["action", "Action", "Closes softly"],
    ["location", "Location", "Quiet, furnished library"],
    ["perspective", "Perspective", "Two metres away"],
    ["character", "Character", "Warm, realistic, restrained"],
    ["avoid", "Avoid", "Voices, music, exaggerated impact"],
  ]

  const selectedState = selected?.kept_asset ? "kept" : candidate ? "ready" : selected && isWorking(selected) ? "working" : "unavailable"
  return <section className="asset-generation-workspace">
    <div className="asset-generation-compose">
      <div className="asset-generation-heading">
        <div className="asset-generation-kind" aria-label="Generation type">
          <button type="button" className={capability === "sfx" ? "active" : ""} onClick={() => setCapability("sfx")}><b>Sound Effect</b><small>1–30 seconds</small></button>
          <button type="button" className={capability === "music" ? "active" : ""} onClick={() => setCapability("music")}><b>Music</b><small>5–120 seconds</small></button>
        </div>
        <ToggleGroup type="single" variant="outline" value={promptMode} onValueChange={(value) => value && setPromptMode(value as "simple" | "expert")} aria-label="Prompting mode">
          <ToggleGroupItem value="simple">Simple</ToggleGroupItem>
          <ToggleGroupItem value="expert">Expert</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {promptMode === "simple" ? <>
        <div className="asset-generation-brief">
          {fields.map(([key, label, placeholder]) => <label key={key}><span>{label}</span><Input value={(brief as unknown as Record<string, string>)[key]} onChange={(event) => updateBrief(key, event.target.value)} placeholder={placeholder} /></label>)}
        </div>
        <Collapsible className="asset-resolved-prompt">
          <CollapsibleTrigger><span>View generated prompt</span><ChevronDown /></CollapsibleTrigger>
          <CollapsibleContent><p>{resolvedPrompt || "Complete the brief to build the generated prompt."}</p><Button variant="ghost" size="sm" onClick={() => { setExpertPrompt(resolvedPrompt); setPromptMode("expert") }}>Edit in Expert</Button></CollapsibleContent>
        </Collapsible>
      </> : <label className="asset-generation-prompt"><span>Prompt sent to the generator</span><Textarea autoFocus value={expertPrompt} maxLength={500} onChange={(event) => setExpertPrompt(event.target.value)} placeholder={capability === "sfx" ? "A heavy wooden door closes softly in a quiet library, realistic room tone, no voices" : "Warm, spacious background music with soft piano and bowed strings, low energy, no vocals"} /><small>{expertPrompt.length}/500</small></label>}

      <div className="asset-generation-controls">
        <label><span>Duration</span><div><Input type="number" min={capability === "sfx" ? 1 : 5} max={capability === "sfx" ? 30 : 120} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} /><small>seconds</small></div></label>
        <label><span>Seed <small>Optional</small></span><Input type="number" min="0" max="2147483647" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Random" /></label>
      </div>
      <div className="asset-generation-action"><span>{status === "checking" ? "Checking generator…" : status === "ready" ? "Each variation remains recoverable in this Production." : reason}</span><ActionButton busy={generating} busyLabel="Starting generation…" disabled={status !== "ready" || !resolvedPrompt || generating} onClick={() => void generate()}><Sparkles />Generate variation</ActionButton></div>
      {error && <p className="asset-generation-error" role="alert">{error}</p>}
    </div>

    <aside className="asset-generation-result" data-state={selectedState}>
      <header><span><b>Recent variations</b><small>Temporary until you Keep one</small></span>{history.length > 0 && <small>{history.length} recent</small>}</header>
      <div className="asset-generation-history">
        {history.length ? history.map((item, index) => {
          const itemCandidate = item.candidate
          const active = itemCandidate && playerPlaying && playingKey === `generated-candidate:${itemCandidate.candidate_id}`
          const label = String.fromCharCode(65 + index)
          const state = item.kept_asset ? "Kept" : itemCandidate ? "Ready" : isWorking(item) ? `${Math.round(item.progress * 100)}%` : item.status === "failed" ? "Failed" : "Discarded"
          return <article key={item.job_id} className={selectedJobId === item.job_id ? "selected" : ""} data-state={state.toLocaleLowerCase()} onClick={() => setSelectedJobId(item.job_id)}>
            <span className="asset-variation-letter">{label}</span>
            <button type="button" className="asset-variation-select"><b>{candidateName(item)}</b><small>{item.request.seconds}s · {itemCandidate?.seed ?? item.request.seed ?? "random seed"}</small></button>
            <span className="asset-variation-state">{state}</span>
            {itemCandidate && <OperatorIconButton label={active ? "Pause variation" : "Audition variation"} detail="Auditioning does not create or place an Asset." onClick={(event) => { event.stopPropagation(); onPlay({ key: `generated-candidate:${itemCandidate.candidate_id}`, url: itemCandidate.candidate_url, title: candidateName(item), subtitle: `Temporary variation ${label}`, kind: "asset" }) }}>{active ? <Pause /> : <Play />}</OperatorIconButton>}
          </article>
        }) : <div className="asset-generation-wait"><FileAudio /><b>No variations yet</b><p>Generate, audition, then Keep only what belongs in the Library.</p></div>}
      </div>

      {selected && <div className="asset-generation-selected">
        <div className="asset-generation-audition"><span><FileAudio /></span><div><b>{candidateName(selected)}</b><small>{candidate ? `${formatDuration(candidate.duration_ms / 1000)} · WAV · seed ${candidate.seed}` : selected.error || selected.detail || "Temporary audio is no longer available"}</small></div></div>
        {candidate && !selected.kept_asset ? <>
          <div className="asset-variation-intent"><Button variant="outline" size="sm" onClick={() => void generate(selected.request, true)}><RotateCcw />Try another</Button><Button variant="ghost" size="sm" onClick={() => refine(selected)}>Refine</Button></div>
          <label><span>Name</span><Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
          <fieldset><legend>Category</legend><div className="asset-category-choice">{CATEGORIES.map(([value, label]) => <button key={value} type="button" className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{label}</button>)}</div></fieldset>
          <label><span>Tags <small>Optional</small></span><div className="asset-tag-entry">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag}<X /></button>)}<input value={tagText} onChange={(event) => setTagText(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag() } }} onBlur={() => addTag()} placeholder="Add tag" /></div></label>
          <fieldset><legend>Available in</legend><div className="asset-scope-choice"><button type="button" className={scope === "studio" ? "active" : ""} onClick={() => setScope("studio")}><b>Studio Library</b><small>Reusable across Ventures</small></button><button type="button" className={scope === "venture" ? "active" : ""} onClick={() => setScope("venture")}><b>This Venture</b><small>Only this Venture</small></button></div></fieldset>
          <div className="asset-generation-result-actions"><ActionButton variant="ghost" busy={discarding} busyLabel="Discarding…" disabled={Boolean(keeping)} onClick={() => void discard()}><Trash2 />Discard</ActionButton><ActionButton variant="outline" busy={keeping === "library"} busyLabel="Keeping…" disabled={Boolean(keeping) || discarding || !name.trim()} onClick={() => void keep(false)}><Check />Keep in Library</ActionButton><ActionButton busy={keeping === "place"} busyLabel={mode === "sound" ? "Adding to track…" : "Inserting…"} disabled={Boolean(keeping) || discarding || !name.trim()} onClick={() => void keep(true)}><Check />{mode === "sound" ? "Keep & Add to Track" : "Keep & Insert"}</ActionButton></div>
        </> : selected.kept_asset ? <div className="asset-generation-kept"><Check /><span><b>Kept in Audio Library</b><small>{selected.kept_asset.name}</small></span></div> : isWorking(selected) ? <div className="asset-generation-progress"><Sparkles /><span><b>{selected.detail || "Generating audio…"}</b><small>{Math.round(selected.progress * 100)}% · you can continue working</small></span></div> : <div className="asset-generation-unavailable"><p>{selected.error || "This temporary candidate was discarded or expired."}</p><Button variant="outline" size="sm" onClick={() => refine(selected)}>Restore intent</Button></div>}
      </div>}
    </aside>
  </section>
}
