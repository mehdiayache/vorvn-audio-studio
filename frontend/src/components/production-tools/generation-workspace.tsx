import {
  AudioLines, Check, ChevronDown, Clipboard, FileAudio, History, Music2,
  Pause, Play, RotateCcw, Sparkles, Trash2, WandSparkles, X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { studioApi } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type {
  AudioAssetCategory, AudioAssetScope, AudioGenerationHistoryItem,
  GeneratedKeepResult, PlayerSource, SoundRecipeCompilation,
  SoundRecipeTaxonomy, VentureAsset,
} from "@/types/domain"

import type { AssetMode, GeneratedKeepInput } from "./asset-tool"
import { AssetCategorySelect, AssetScopeSelect, AssetTagEditor } from "./asset-library-controls"
import {
  RecipeField, RecipeStage, SemanticScale, SingleChoice, TaxonomyPicker,
} from "./sound-recipe-controls"
import {
  emptySoundRecipe, inferKnownSelections, recipePath, recipeSummary,
  selectionLabels, taxonomyItems, updateRecipePath, valueId, valueLabel,
  type RecipeCapability, type RecipeInstrument, type SemanticValue,
  type SoundRecipe, type TaxonomyItem,
} from "./sound-recipe"

const MUSIC_STAGES = ["Use & Story", "Voice & Feeling", "Musical World", "Instruments", "Arrangement", "Sound & Space", "Review"]
const SFX_STAGES = ["Sound", "Action", "Perspective", "Character", "Review"]

function candidateName(item: AudioGenerationHistoryItem) {
  const prompt = item.request.resolved_prompt || ""
  const concise = prompt.split(/[.!?]/)[0]?.replace(/^[^:]+:\s*/, "").replace(/^(TrackType:[^,]+,\s*)/i, "").trim().slice(0, 72)
  return concise || (item.request.capability === "music" ? "Generated music" : "Generated sound effect")
}

function isWorking(item: AudioGenerationHistoryItem) {
  return ["queued", "running", "retrying"].includes(item.status)
}

function variationState(item: AudioGenerationHistoryItem) {
  if (item.kept_asset) return "Kept"
  if (item.candidate) return "Ready"
  if (isWorking(item)) return `${Math.round(item.progress * 100)}%`
  if (item.status === "failed") return "Failed"
  return "Discarded"
}

function pathValues(recipe: SoundRecipe, path: string): SemanticValue[] {
  const value = recipePath(recipe, path)
  return Array.isArray(value) ? value as SemanticValue[] : value ? [value as SemanticValue] : []
}

function summaryFor(items: TaxonomyItem[], recipe: SoundRecipe, paths: string[]) {
  return paths.flatMap((path) => selectionLabels(recipePath(recipe, path), items)).slice(0, 5).join(" · ")
}

function contextSuggestions(recipe: SoundRecipe, category: string) {
  const context = new Set(pathValues(recipe, "context").map(valueId))
  if (context.has("context.faith")) return {
    moment: ["moment.scripture", "moment.prayer", "moment.testimony", "moment.gathering"],
    mood: ["mood.reverent", "mood.reflective", "mood.calm", "mood.hopeful", "mood.warm"],
    genre: ["genre.neo_classical", "genre.ambient", "genre.spiritual_ambient", "genre.gospel", "genre.neo_soul"],
    instrument: ["instrument.felt_piano", "instrument.synth_pad", "instrument.cello", "instrument.bowed_strings", "instrument.hammond"],
  }[category]
  if (context.has("context.story")) return {
    moment: ["moment.reflection", "moment.suspense"],
    mood: ["mood.reflective", "mood.intimate", "mood.warm", "mood.bittersweet", "mood.mysterious"],
    genre: ["genre.neo_classical", "genre.ambient", "genre.cinematic", "genre.minimal", "genre.acoustic_folk"],
    instrument: ["instrument.felt_piano", "instrument.cello", "instrument.bowed_strings", "instrument.synth_pad", "instrument.acoustic_guitar"],
  }[category]
  return undefined
}

function legacyRecipe(item: AudioGenerationHistoryItem): SoundRecipe {
  const capability = item.request.capability as RecipeCapability
  const recipe = emptySoundRecipe(capability)
  recipe.creative_brief = item.request.source_free_text || item.request.authored_prompt || item.request.resolved_prompt || ""
  recipe.duration = item.request.seconds
  recipe.seed = item.request.seed ?? -1
  return recipe
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
  const [capability, setCapability] = useState<RecipeCapability>("sfx")
  const [promptMode, setPromptMode] = useState<"simple" | "expert">("simple")
  const [recipes, setRecipes] = useState<Record<RecipeCapability, SoundRecipe>>({
    music: emptySoundRecipe("music"), sfx: emptySoundRecipe("sfx"),
  })
  const [activeStage, setActiveStage] = useState(0)
  const [taxonomy, setTaxonomy] = useState<SoundRecipeTaxonomy | null>(null)
  const [compilation, setCompilation] = useState<SoundRecipeCompilation | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [promptOverride, setPromptOverride] = useState<Record<RecipeCapability, string | null>>({ music: null, sfx: null })
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [history, setHistory] = useState<AudioGenerationHistoryItem[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<AudioAssetCategory>("sfx")
  const [scope, setScope] = useState<AudioAssetScope>("studio")
  const [tags, setTags] = useState<string[]>([])
  const [keeping, setKeeping] = useState<"place" | "library" | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const compileSequence = useRef(0)

  const recipe = recipes[capability]
  const items = useMemo(() => taxonomyItems(taxonomy), [taxonomy])
  const stages = capability === "music" ? MUSIC_STAGES : SFX_STAGES
  const capabilityHistory = useMemo(() => history.filter((item) => item.request.capability === capability), [history, capability])
  const selected = capabilityHistory.find((item) => item.job_id === selectedJobId) || null
  const candidate = selected?.candidate || null
  const anyWorking = history.some(isWorking)
  const unresolvedConflicts = compilation?.conflicts || []
  const generatedPrompt = compilation?.compiled_prompt || ""

  const setRecipe = (next: SoundRecipe | ((current: SoundRecipe) => SoundRecipe)) => {
    setRecipes((current) => ({
      ...current,
      [capability]: typeof next === "function" ? next(current[capability]) : next,
    }))
    setPromptOverride((current) => ({ ...current, [capability]: null }))
  }
  const setPath = (path: string, value: unknown) => setRecipe((current) => updateRecipePath(current, path, value))

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
      setError(cause instanceof Error ? cause.message : "Recent variations could not be loaded.")
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
    void studioApi.soundRecipeTaxonomy().then((snapshot) => { if (current) setTaxonomy(snapshot) }).catch((cause) => {
      if (current) setError(cause instanceof Error ? cause.message : "The Sound Recipe vocabulary could not be loaded.")
    })
    return () => { current = false }
  }, [])
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
    const sequence = ++compileSequence.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setCompiling(true)
      void studioApi.compileSoundRecipe({
        capability,
        semantic_state: recipe,
        source_free_text: recipe.creative_brief,
        final_prompt_override: promptOverride[capability],
      }, controller.signal).then((result) => {
        if (sequence !== compileSequence.current) return
        setCompilation(result); setError("")
      }).catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        if (sequence !== compileSequence.current) return
        setError(cause instanceof Error ? cause.message : "The Sound Recipe could not be compiled.")
      }).finally(() => { if (sequence === compileSequence.current) setCompiling(false) })
    }, 180)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [capability, recipe, promptOverride])
  useEffect(() => {
    setCategory(capability === "music" ? "music" : "sfx")
    setActiveStage(0); setEditingPrompt(false)
  }, [capability])
  useEffect(() => {
    if (capabilityHistory.some((item) => item.job_id === selectedJobId)) return
    setSelectedJobId(capabilityHistory.find((item) => item.candidate_available)?.job_id || capabilityHistory[0]?.job_id || null)
  }, [capability, history, selectedJobId])
  useEffect(() => {
    if (!selected) return
    setName(candidateName(selected))
    setCategory(selected.request.capability === "music" ? "music" : "sfx")
    setTags([])
  }, [selectedJobId])

  const changeMode = (nextMode: "simple" | "expert") => {
    if (nextMode === "expert") setRecipe((current) => inferKnownSelections(current, items))
    setPromptMode(nextMode)
  }

  const generate = async () => {
    if (!generatedPrompt || unresolvedConflicts.length) return
    setGenerating(true); setGenerationProgress(0); setError("")
    try {
      const count = recipe.variation_count
      for (let index = 0; index < count; index += 1) {
        const semanticState = {
          ...recipe,
          seed: recipe.seed < 0 ? -1 : Math.min(2_147_483_647, recipe.seed + index),
        }
        const job = await studioApi.enqueueAudioGeneration({
          capability,
          prompt: null,
          prompt_mode: promptMode,
          semantic_state: semanticState,
          source_free_text: recipe.creative_brief,
          final_prompt_override: promptOverride[capability],
          authored_prompt: promptOverride[capability],
          generation_brief: null,
          seconds: recipe.duration,
          seed: semanticState.seed < 0 ? null : semanticState.seed,
          production_id: productionId,
        })
        setSelectedJobId(job.id)
        setGenerationProgress(index + 1)
      }
      await refreshHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio could not be generated.")
    } finally { setGenerating(false) }
  }

  const refine = (item: AudioGenerationHistoryItem) => {
    const nextCapability = item.request.capability as RecipeCapability
    const restored = item.request.semantic_state
      ? item.request.semantic_state as SoundRecipe
      : legacyRecipe(item)
    setCapability(nextCapability)
    setRecipes((current) => ({ ...current, [nextCapability]: restored }))
    setPromptMode(item.request.prompt_mode as "simple" | "expert")
    setPromptOverride((current) => ({ ...current, [nextCapability]: null }))
    setActiveStage(0); setError("")
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
      setError(cause instanceof Error ? cause.message : "That variation could not be discarded.")
    } finally { setDiscarding(false) }
  }

  const resolveConflict = (id: string, resolution: "structured" | "brief") => setRecipe((current) => ({
    ...current, conflict_resolutions: { ...current.conflict_resolutions, [id]: resolution },
  }))

  const selectedState = selected?.kept_asset ? "kept" : candidate ? "ready" : selected && isWorking(selected) ? "working" : "unavailable"
  const statusCopy = status === "checking" ? "Checking generator…" : status === "ready" ? "Temporary until you keep it." : reason
  const selectedIndex = selected ? capabilityHistory.findIndex((item) => item.job_id === selected.job_id) : -1
  const selectedLabel = selectedIndex >= 0 ? String.fromCharCode(65 + selectedIndex) : ""
  const selectedActive = Boolean(candidate && playerPlaying && playingKey === `generated-candidate:${candidate.candidate_id}`)
  const stageSummary = (index: number) => capability === "music" ? [
    summaryFor(items, recipe, ["context", "moment", "cue_role"]),
    summaryFor(items, recipe, ["voice_relationship", "moods", "energy"]),
    summaryFor(items, recipe, ["genres", "harmonic_feel", "pace"]),
    (recipe.instruments as RecipeInstrument[]).map((item) => valueLabel(item.id, items)).join(" · "),
    summaryFor(items, recipe, ["arrangement.density", "arrangement.melody_prominence", "arrangement.percussion_presence"]),
    summaryFor(items, recipe, ["production.characters", "production.space", "cue_behaviour.ending"]),
    "",
  ][index] : [
    summaryFor(items, recipe, ["family", "source", "material"]),
    summaryFor(items, recipe, ["action", "motion"]),
    summaryFor(items, recipe, ["perspective", "environment"]),
    summaryFor(items, recipe, ["intensity", "character", "behaviour"]),
    "",
  ][index]

  return <section className="asset-view asset-generation-view">
    <main className="asset-generation-compose">
      <div className="asset-generation-heading">
        <Tabs value={capability} onValueChange={(value) => setCapability(value as RecipeCapability)} className="asset-generation-kind">
          <TabsList aria-label="Generate audio type">
            <TabsTrigger value="sfx" aria-label="Sound Effect"><AudioLines /><span><b>Sound Effect</b><small>Events, foley & ambience</small></span></TabsTrigger>
            <TabsTrigger value="music" aria-label="Music"><Music2 /><span><b>Music</b><small>Instrumental production cues</small></span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="asset-generation-heading-actions">
          <ToggleGroup type="single" variant="outline" value={promptMode} onValueChange={(value) => value && changeMode(value as "simple" | "expert")} aria-label="Creation mode">
            <OperatorTooltip label="Simple" detail="Describe what you need in your own words. It uses the same model and Recipe compiler as Expert."><ToggleGroupItem value="simple">Simple</ToggleGroupItem></OperatorTooltip>
            <OperatorTooltip label="Expert" detail="Shape musical or sonic details yourself. Expert adds control, not model quality."><ToggleGroupItem value="expert">Expert</ToggleGroupItem></OperatorTooltip>
          </ToggleGroup>
          <HistoryMenu history={capabilityHistory} selectedJobId={selectedJobId} open={historyOpen} onOpenChange={setHistoryOpen} onSelect={setSelectedJobId} />
        </div>
      </div>

      {promptMode === "simple" ? <SimpleRecipe recipe={recipe} capability={capability} onChange={setRecipe} onOpenExpert={() => changeMode("expert")} /> : <div className="recipe-funnel">
        <nav className="recipe-step-rail" aria-label={`${capability === "music" ? "Music" : "Sound Effect"} recipe steps`}>{stages.map((stage, index) => <button type="button" key={stage} className={activeStage === index ? "is-active" : ""} onClick={() => setActiveStage(index)}><span>{stageSummary(index) ? <Check /> : index + 1}</span><b>{stage}</b></button>)}</nav>
        {stages.map((stage, index) => <RecipeStage key={stage} number={index + 1} title={stage} summary={stageSummary(index) || ""} open={activeStage === index} onOpenChange={(open) => open && setActiveStage(index)}>
          {capability === "music" ? <MusicStage index={index} recipe={recipe} items={items} setPath={setPath} setRecipe={setRecipe} /> : <SfxStage index={index} recipe={recipe} items={items} setPath={setPath} setRecipe={setRecipe} />}
          {index < stages.length - 1 && <div className="recipe-stage-next"><Button variant="ghost" onClick={() => setActiveStage(index + 1)}>Skip for now</Button><Button onClick={() => setActiveStage(index + 1)}>Continue</Button></div>}
        </RecipeStage>)}
      </div>}

      {unresolvedConflicts.length > 0 && <section className="recipe-conflicts" aria-live="polite"><header><b>Choose the direction that should win</b><span>We will not send contradictory instructions.</span></header>{unresolvedConflicts.map((conflict) => <div key={conflict.id}><p><b>{conflict.structured}</b>{conflict.free_text && <><span>conflicts with</span><b>“{conflict.free_text}”</b></>}</p><div><Button variant="outline" size="sm" onClick={() => resolveConflict(conflict.id, "structured")}>Keep structured choice</Button>{conflict.free_text && <Button variant="outline" size="sm" onClick={() => resolveConflict(conflict.id, "brief")}>Keep brief wording</Button>}</div></div>)}</section>}

      <PromptPreview compilation={compilation} compiling={compiling} editing={editingPrompt} override={promptOverride[capability]} onEditing={setEditingPrompt} onOverride={(value) => setPromptOverride((current) => ({ ...current, [capability]: value }))} />
    </main>

    <aside className="asset-inspector asset-generation-inspector" data-state={selectedState}>
      <RecipePanel recipe={recipe} items={items} compilation={compilation} />
      <CandidatePanel selected={selected} candidate={candidate} selectedLabel={selectedLabel} selectedActive={selectedActive} name={name} category={category} scope={scope} tags={tags} onName={setName} onCategory={setCategory} onScope={setScope} onTags={setTags} onError={setError} onPlay={onPlay} onRefine={() => selected && refine(selected)} />
    </aside>

    <footer className="asset-action-bar"><div><b>{candidate ? candidateName(selected!) : capability === "music" ? "New music recipe" : "New sound recipe"}</b><span>{generating ? `Starting variation ${Math.min(generationProgress + 1, recipe.variation_count)} of ${recipe.variation_count}…` : statusCopy}</span></div>{error && <p role="alert">{error}</p>}{candidate && !selected?.kept_asset ? <><ActionButton variant="outline" busy={generating} busyLabel="Starting new variations…" disabled={status !== "ready" || !generatedPrompt || compiling || Boolean(unresolvedConflicts.length) || Boolean(keeping) || discarding} onClick={() => void generate()}><Sparkles />Generate new</ActionButton><ActionButton variant="ghost" busy={discarding} busyLabel="Discarding…" disabled={Boolean(keeping) || generating} onClick={() => void discard()}><Trash2 />Discard</ActionButton><ActionButton variant="outline" busy={keeping === "library"} busyLabel="Keeping…" disabled={Boolean(keeping) || discarding || generating || !name.trim()} onClick={() => void keep(false)}><Check />Keep in Library</ActionButton><ActionButton busy={keeping === "place"} busyLabel={mode === "sound" ? "Adding to track…" : "Inserting…"} disabled={Boolean(keeping) || discarding || generating || !name.trim()} onClick={() => void keep(true)}><Check />{mode === "sound" ? "Keep & Add to Track" : "Keep & Insert"}</ActionButton></> : <ActionButton busy={generating} busyLabel={`Starting ${recipe.variation_count} variation${recipe.variation_count === 1 ? "" : "s"}…`} disabled={status !== "ready" || !generatedPrompt || compiling || Boolean(unresolvedConflicts.length)} onClick={() => void generate()}><Sparkles />Generate {recipe.variation_count} variation{recipe.variation_count === 1 ? "" : "s"}</ActionButton>}</footer>
  </section>
}

function SimpleRecipe({ recipe, capability, onChange, onOpenExpert }: { recipe: SoundRecipe; capability: RecipeCapability; onChange: (recipe: SoundRecipe) => void; onOpenExpert: () => void }) {
  return <section className="recipe-simple">
    <header><span><WandSparkles /></span><div><h3>Describe what you need</h3><p>Write for the production moment. We turn it into an English Stable Audio recipe without changing models.</p></div></header>
    <Textarea autoFocus value={recipe.creative_brief} onChange={(event) => onChange({ ...recipe, creative_brief: event.target.value })} placeholder={capability === "music" ? "Gentle music underneath a prayer, intimate and hopeful, with felt piano and soft strings…" : "A heavy wooden church door slams shut nearby, realistic, weighty, with a long natural room tail…"} />
    <div className="recipe-simple-actions"><span>{recipe.creative_brief.trim() ? "Ready to shape" : "Start with the situation and what should be heard"}</span><Button variant="outline" onClick={onOpenExpert}>Shape in Expert</Button></div>
    <GenerationSettings recipe={recipe} onChange={onChange} capability={capability} />
  </section>
}

function MusicStage({ index, recipe, items, setPath, setRecipe }: { index: number; recipe: SoundRecipe; items: TaxonomyItem[]; setPath: (path: string, value: unknown) => void; setRecipe: (recipe: SoundRecipe | ((current: SoundRecipe) => SoundRecipe)) => void }) {
  if (index === 0) return <>
    <RecipeField label="What are you creating music for?" help="Context helps suggestions but never decides the musical style."><TaxonomyPicker items={items} category="context" label="contexts" value={pathValues(recipe, "context")} onChange={(value) => setPath("context", value)} /></RecipeField>
    <RecipeField label="What is happening?" help="The scene or production moment the cue needs to support."><TaxonomyPicker items={items} category="moment" label="moments" value={pathValues(recipe, "moment")} onChange={(value) => setPath("moment", value)} suggestions={contextSuggestions(recipe, "moment")} /></RecipeField>
    <RecipeField label="What should the music do?" help="The job this cue performs in the finished production."><TaxonomyPicker items={items} category="cue_role" label="cue roles" value={pathValues(recipe, "cue_role")} onChange={(value) => setPath("cue_role", value)} /></RecipeField>
  </>
  if (index === 1) return <>
    <RecipeField label="Will someone be speaking over it?" help="This controls how much musical space the spoken voice needs."><SingleChoice items={items} category="speech_presence" label="speech choices" value={pathValues(recipe, "speech_presence")[0] || null} onChange={(value) => setPath("speech_presence", value)} /></RecipeField>
    <SemanticScale label="Relationship to voice" help="Choose whether music remains deep behind speech or becomes part of the foreground." items={items} values={["voice.deep_background", "voice.under_speech", "voice.supportive", "voice.balanced", "voice.music_forward"]} value={valueId(pathValues(recipe, "voice_relationship")[0]) || null} onChange={(value) => setPath("voice_relationship", value)} />
    <RecipeField label="How should it feel?" help="Choose the emotions the listener should experience."><TaxonomyPicker items={items} category="mood" label="moods" value={pathValues(recipe, "moods")} onChange={(value) => setPath("moods", value)} suggestions={contextSuggestions(recipe, "mood")} /></RecipeField>
    <div className="recipe-two-up"><SemanticScale label="Energy" help="The perceived force and forward motion of the cue." items={items} values={["energy.very_low", "energy.low", "energy.balanced", "energy.high", "energy.intense"]} value={valueId(pathValues(recipe, "energy")[0]) || null} onChange={(value) => setPath("energy", value)} /><SemanticScale label="Tension" help="How peaceful or pressured the cue should feel." items={items} values={["tension.peaceful", "tension.slight", "tension.uneasy", "tension.tense", "tension.intense"]} value={valueId(pathValues(recipe, "tension")[0]) || null} onChange={(value) => setPath("tension", value)} /></div>
    <RecipeField label="Should the feeling change?" help="Describe the emotional movement across the cue."><SingleChoice items={items} category="emotional_arc" label="emotional arcs" value={pathValues(recipe, "emotional_arc")[0] || null} onChange={(value) => setPath("emotional_arc", value)} /></RecipeField>
  </>
  if (index === 2) return <>
    <RecipeField label="What musical world should it live in?" help="Context does not limit style. Browse the complete musical vocabulary or add your own."><TaxonomyPicker items={items} category="genre" label="styles" value={pathValues(recipe, "genres")} onChange={(value) => setPath("genres", value)} suggestions={contextSuggestions(recipe, "genre")} /></RecipeField>
    <RecipeField label="How should the chords feel?" help="Harmony controls emotional colour without requiring music theory."><TaxonomyPicker items={items} category="harmonic_feel" label="harmony choices" value={pathValues(recipe, "harmonic_feel")} onChange={(value) => setPath("harmonic_feel", value)} /></RecipeField>
    <SemanticScale label="Pace" help="Perceived speed. Exact BPM remains optional." items={items} values={["pace.very_slow", "pace.slow", "pace.relaxed", "pace.moderate", "pace.fast"]} value={valueId(pathValues(recipe, "pace")[0]) || null} onChange={(value) => setPath("pace", value)} />
    <div className="recipe-two-up"><RecipeField label="Exact BPM (optional)" help="Use an exact tempo only when the production needs one."><Input type="number" min={30} max={240} value={(recipe.exact_bpm as number | null) ?? ""} onChange={(event) => setPath("exact_bpm", event.target.value ? Number(event.target.value) : null)} placeholder="e.g. 72" /></RecipeField><RecipeField label="Rhythm & groove" help="Choose the kind of pulse or pocket, not an exact drum pattern."><TaxonomyPicker items={items} category="rhythm_groove" label="grooves" value={pathValues(recipe, "rhythm_groove")} onChange={(value) => setPath("rhythm_groove", value)} /></RecipeField></div>
  </>
  if (index === 3) return <InstrumentStage recipe={recipe} items={items} onChange={(instruments) => setPath("instruments", instruments)} />
  if (index === 4) return <>
    <div className="recipe-arrangement-intro"><div><h3>How should the music behave?</h3><p>These remain creative directions for Stable Audio, not fake DSP controls.</p></div><Button variant="outline" size="sm" onClick={() => setRecipe((current) => ({ ...current, arrangement: { ...(current.arrangement as object), density: "arrangement.density_sparse", melody_prominence: "arrangement.melody_background", rhythmic_activity: "arrangement.rhythm_gentle", percussion_presence: "arrangement.percussion_none", dynamics: "arrangement.dynamics_restrained", evolution: "arrangement.evolution_slow", harmonic_movement: "arrangement.harmony_slow", phrase_space: "arrangement.phrase_space" } }))}>Make it work under speech</Button></div>
    <div className="recipe-two-up"><SemanticScale label="How full should it feel?" help="Arrangement density: how many musical elements play together." items={items} values={["arrangement.density_sparse", "arrangement.density_balanced", "arrangement.density_dense"]} value={valueId(pathValues(recipe, "arrangement.density")[0]) || null} onChange={(value) => setPath("arrangement.density", value)} /><SemanticScale label="How noticeable should melody be?" help="Melody prominence: background texture through to a lead theme." items={items} values={["arrangement.melody_minimal", "arrangement.melody_background", "arrangement.melody_lead"]} value={valueId(pathValues(recipe, "arrangement.melody_prominence")[0]) || null} onChange={(value) => setPath("arrangement.melody_prominence", value)} /></div>
    <div className="recipe-two-up"><SemanticScale label="How active should rhythm be?" help="Rhythmic activity: still texture through to driving motion." items={items} values={["arrangement.rhythm_still", "arrangement.rhythm_gentle", "arrangement.rhythm_driving"]} value={valueId(pathValues(recipe, "arrangement.rhythmic_activity")[0]) || null} onChange={(value) => setPath("arrangement.rhythmic_activity", value)} /><SemanticScale label="How much percussion?" help="Percussion presence: none through to a prominent drum part." items={items} values={["arrangement.percussion_none", "arrangement.percussion_light", "arrangement.percussion_heavy"]} value={valueId(pathValues(recipe, "arrangement.percussion_presence")[0]) || null} onChange={(value) => setPath("arrangement.percussion_presence", value)} /></div>
    <div className="recipe-two-up"><SemanticScale label="How much should it swell?" help="Dynamics: restrained continuity through to dramatic change." items={items} values={["arrangement.dynamics_restrained", "arrangement.dynamics_natural", "arrangement.dynamics_dramatic"]} value={valueId(pathValues(recipe, "arrangement.dynamics")[0]) || null} onChange={(value) => setPath("arrangement.dynamics", value)} /><SemanticScale label="How much should it develop?" help="Evolution: static texture through to strong musical development." items={items} values={["arrangement.evolution_static", "arrangement.evolution_slow", "arrangement.evolution_strong"]} value={valueId(pathValues(recipe, "arrangement.evolution")[0]) || null} onChange={(value) => setPath("arrangement.evolution", value)} /></div>
    <div className="recipe-two-up"><SemanticScale label="How often should chords move?" help="Chord movement controls the pace of harmonic change." items={items} values={["arrangement.harmony_slow", "arrangement.harmony_moderate", "arrangement.harmony_frequent"]} value={valueId(pathValues(recipe, "arrangement.harmonic_movement")[0]) || null} onChange={(value) => setPath("arrangement.harmonic_movement", value)} /><SemanticScale label="How much breathing room?" help="Phrase space controls gaps between musical gestures." items={items} values={["arrangement.phrase_space", "arrangement.phrase_continuous"]} value={valueId(pathValues(recipe, "arrangement.phrase_space")[0]) || null} onChange={(value) => setPath("arrangement.phrase_space", value)} /></div>
  </>
  if (index === 5) return <>
    <RecipeField label="How should it sound?" help="Overall sonic and production character."><TaxonomyPicker items={items} category="production_character" label="sound characters" value={pathValues(recipe, "production.characters")} onChange={(value) => setPath("production.characters", value)} /></RecipeField>
    <div className="recipe-two-up"><RecipeField label="Acoustic or electronic?" help="Choose the overall instrument and production palette."><SingleChoice items={items} category="production_palette" label="palettes" value={pathValues(recipe, "production.palette")[0] || null} onChange={(value) => setPath("production.palette", value)} /></RecipeField><RecipeField label="Tone" help="The overall dark-to-bright tonal direction."><SingleChoice items={items} category="production_tone" label="tones" value={pathValues(recipe, "production.tone")[0] || null} onChange={(value) => setPath("production.tone", value)} /></RecipeField></div>
    <RecipeField label="How close should it feel?" help="The perceived room and physical distance of the production."><TaxonomyPicker items={items} category="space" label="spaces" value={pathValues(recipe, "production.space")} onChange={(value) => setPath("production.space", value)} /></RecipeField>
    <RecipeField label="Recording character" help="Optional recording and stereo character."><TaxonomyPicker items={items} category="recording_character" label="recording choices" value={pathValues(recipe, "production.recording_character")} onChange={(value) => setPath("production.recording_character", value)} /></RecipeField>
    <div className="recipe-two-up"><RecipeField label="How should it end?" help="The final editorial behaviour of the cue."><SingleChoice items={items} category="ending" label="endings" value={pathValues(recipe, "cue_behaviour.ending")[0] || null} onChange={(value) => setPath("cue_behaviour.ending", value)} /></RecipeField><RecipeField label="Loop intention" help="Prompt for continuation-friendly material; true seamless loops still require editing."><SingleChoice items={items} category="loop_intention" label="loop choices" value={pathValues(recipe, "cue_behaviour.loop_intention")[0] || null} onChange={(value) => setPath("cue_behaviour.loop_intention", value)} /></RecipeField></div>
    <RecipeField label="Keep out" help="We translate exclusions into positive directions the post-trained Small model can follow."><TaxonomyPicker items={items} category="constraint" label="constraints" value={pathValues(recipe, "constraints")} onChange={(value) => setPath("constraints", value)} /></RecipeField>
    <GenerationSettings recipe={recipe} onChange={(next) => setRecipe(next)} capability="music" />
  </>
  return <RecipeReview recipe={recipe} items={items} />
}

function SfxStage({ index, recipe, items, setPath, setRecipe }: { index: number; recipe: SoundRecipe; items: TaxonomyItem[]; setPath: (path: string, value: unknown) => void; setRecipe: (recipe: SoundRecipe | ((current: SoundRecipe) => SoundRecipe)) => void }) {
  if (index === 0) return <>
    <RecipeField label="What sound?" help="Name the physical source or environmental sound."><Input value={selectionLabels(recipe.source, items)[0] || ""} onChange={(event) => setPath("source", event.target.value ? [{ display: event.target.value, canonical_en: event.target.value, source: "custom" }] : [])} placeholder="Heavy wooden door, light rain, ceramic cup…" /></RecipeField>
    <div className="recipe-two-up"><RecipeField label="Sound family" help="The broad production role of the sound."><TaxonomyPicker items={items} category="sfx_family" label="sound families" value={pathValues(recipe, "family")} onChange={(value) => setPath("family", value)} /></RecipeField><RecipeField label="Material" help="The physical material strongly affects resonance and attack."><TaxonomyPicker items={items} category="sfx_material" label="materials" value={pathValues(recipe, "material")} onChange={(value) => setPath("material", value)} /></RecipeField></div>
  </>
  if (index === 1) return <>
    <RecipeField label="What happens?" help="Describe the exact action, not just the object."><TaxonomyPicker items={items} category="sfx_action" label="actions" value={pathValues(recipe, "action")} onChange={(value) => setPath("action", value)} /></RecipeField>
    <RecipeField label="How does it move?" help="Movement relative to the listener shapes level and perspective."><SingleChoice items={items} category="sfx_motion" label="motions" value={pathValues(recipe, "motion")[0] || null} onChange={(value) => setPath("motion", value)} /></RecipeField>
  </>
  if (index === 2) return <>
    <RecipeField label="Where are we listening from?" help="Listening distance changes detail, direct sound and room balance."><SingleChoice items={items} category="sfx_perspective" label="perspectives" value={pathValues(recipe, "perspective")[0] || null} onChange={(value) => setPath("perspective", value)} /></RecipeField>
    <RecipeField label="Where does it happen?" help="The environment determines reflections, filtering and background context."><TaxonomyPicker items={items} category="sfx_environment" label="environments" value={pathValues(recipe, "environment")} onChange={(value) => setPath("environment", value)} /></RecipeField>
  </>
  if (index === 3) return <>
    <RecipeField label="How forceful?" help="Physical intensity of the event."><SingleChoice items={items} category="sfx_intensity" label="intensity choices" value={pathValues(recipe, "intensity")[0] || null} onChange={(value) => setPath("intensity", value)} /></RecipeField>
    <div className="recipe-two-up"><RecipeField label="Attack & decay" help="How quickly the sound arrives and how long it remains."><TaxonomyPicker items={items} category="sfx_envelope" label="envelope choices" value={pathValues(recipe, "envelope")} onChange={(value) => setPath("envelope", value)} /></RecipeField><RecipeField label="Character" help="The tactile or emotional character of the sound."><TaxonomyPicker items={items} category="sfx_character" label="characters" value={pathValues(recipe, "character")} onChange={(value) => setPath("character", value)} /></RecipeField></div>
    <div className="recipe-two-up"><RecipeField label="Realism" help="Choose physical realism or deliberate sound design."><SingleChoice items={items} category="sfx_realism" label="realism choices" value={pathValues(recipe, "realism")[0] || null} onChange={(value) => setPath("realism", value)} /></RecipeField><RecipeField label="Behaviour" help="A one-shot event or a continuous environmental bed."><SingleChoice items={items} category="sfx_behaviour" label="behaviours" value={pathValues(recipe, "behaviour")[0] || null} onChange={(value) => setPath("behaviour", value)} /></RecipeField></div>
    <RecipeField label="Processing" help="Optional production colour. Keep realistic sounds lightly processed."><TaxonomyPicker items={items} category="sfx_processing" label="processing choices" value={pathValues(recipe, "processing")} onChange={(value) => setPath("processing", value)} /></RecipeField>
    <GenerationSettings recipe={recipe} onChange={(next) => setRecipe(next)} capability="sfx" />
  </>
  return <RecipeReview recipe={recipe} items={items} />
}

function InstrumentStage({ recipe, items, onChange }: { recipe: SoundRecipe; items: TaxonomyItem[]; onChange: (value: RecipeInstrument[]) => void }) {
  const instruments = recipe.instruments as RecipeInstrument[]
  const selected = instruments.map((item) => item.id)
  const setSelected = (values: SemanticValue[]) => onChange(values.map((value) => instruments.find((item) => valueId(item.id) === valueId(value)) || { id: value, modifiers: [] }))
  return <>
    <RecipeField label="What should we hear?" help="Choose instruments, then refine how each one should be played or recorded."><TaxonomyPicker items={items} category="instrument" label="instruments" value={selected} onChange={setSelected} suggestions={contextSuggestions(recipe, "instrument")} /></RecipeField>
    <div className="recipe-instrument-list">{instruments.map((instrument, index) => <article key={valueId(instrument.id)}><header><span><Music2 /></span><div><b>{valueLabel(instrument.id, items)}</b><small>{instrument.modifiers.length ? instrument.modifiers.map((value) => valueLabel(value, items)).join(" · ") : "Choose performance details if they matter"}</small></div><OperatorIconButton label={`Remove ${valueLabel(instrument.id, items)}`} detail="Removes this instrument from the Sound Recipe." onClick={() => onChange(instruments.filter((_, itemIndex) => itemIndex !== index))}><X /></OperatorIconButton></header><TaxonomyPicker items={items} category="instrument_modifier" label="performance details" value={instrument.modifiers} onChange={(modifiers) => onChange(instruments.map((item, itemIndex) => itemIndex === index ? { ...item, modifiers } : item))} /></article>)}</div>
  </>
}

function GenerationSettings({ recipe, onChange, capability }: { recipe: SoundRecipe; onChange: (recipe: SoundRecipe) => void; capability: RecipeCapability }) {
  const maximumDuration = capability === "music" ? 120 : 30
  return <section className="recipe-generation-settings"><header><b>Generation</b><span>Real model parameters</span></header><div><RecipeField label="Duration" help={`Sent to the current ${capability === "music" ? "Music" : "Sound Effect"} service as a real duration parameter (${capability === "music" ? "5–120" : "1–30"} seconds).`}><div className="recipe-duration"><Input type="number" min={capability === "music" ? 5 : 1} max={maximumDuration} value={recipe.duration} onChange={(event) => onChange({ ...recipe, duration: Math.min(maximumDuration, Number(event.target.value)) })} /><span>seconds</span></div></RecipeField><RecipeField label="Variations" help="Each variation is a separate temporary candidate with its actual seed."><ToggleGroup type="single" variant="outline" value={String(recipe.variation_count)} onValueChange={(value) => value && onChange({ ...recipe, variation_count: Number(value) as 1 | 2 | 4 })} aria-label="Number of variations"><ToggleGroupItem value="1">1</ToggleGroupItem><ToggleGroupItem value="2">2</ToggleGroupItem><ToggleGroupItem value="4">4</ToggleGroupItem></ToggleGroup></RecipeField><RecipeField label="Seed (advanced)" help="Random by default. Reuse a seed to reproduce a generation more closely."><Input type="number" min={0} max={2_147_483_647} value={recipe.seed < 0 ? "" : recipe.seed} onChange={(event) => onChange({ ...recipe, seed: event.target.value ? Number(event.target.value) : -1 })} placeholder="Random" /></RecipeField></div></section>
}

function RecipeReview({ recipe, items }: { recipe: SoundRecipe; items: TaxonomyItem[] }) {
  const summary = recipeSummary(recipe, items)
  return <section className="recipe-review"><header><span><Sparkles /></span><div><h3>Your {recipe.model_type === "music" ? "music" : "sound"}</h3><p>Read the production brief as a whole. Jump back to any step if something feels wrong.</p></div></header>{recipe.creative_brief && <blockquote>{recipe.creative_brief}</blockquote>}<dl>{summary.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.values.join(" · ")}</dd></div>)}</dl><div className="recipe-review-settings"><span>{recipe.duration}s</span><span>{recipe.variation_count} variation{recipe.variation_count === 1 ? "" : "s"}</span><span>{recipe.seed < 0 ? "Random seeds" : `Seed ${recipe.seed}`}</span></div></section>
}

function RecipePanel({ recipe, items, compilation }: { recipe: SoundRecipe; items: TaxonomyItem[]; compilation: SoundRecipeCompilation | null }) {
  const summary = recipeSummary(recipe, items)
  return <section className="recipe-panel"><header><span><WandSparkles /></span><div><small>Sound Recipe</small><h3>{recipe.model_type === "music" ? "Your music" : "Your sound"}</h3></div></header>{recipe.creative_brief && <p>{recipe.creative_brief}</p>}<dl>{summary.length ? summary.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.values.join(" · ")}</dd></div>) : <div className="recipe-panel-empty">Your choices will collect here as one production brief.</div>}</dl><footer><span>{recipe.duration}s</span><span>{recipe.variation_count} variation{recipe.variation_count === 1 ? "" : "s"}</span>{compilation && <OperatorTooltip label="Versioned recipe" detail={`${compilation.semantic_schema_version} · ${compilation.compiler_version} · ${compilation.taxonomy_version}`}><button type="button">v1</button></OperatorTooltip>}</footer></section>
}

function PromptPreview({ compilation, compiling, editing, override, onEditing, onOverride }: { compilation: SoundRecipeCompilation | null; compiling: boolean; editing: boolean; override: string | null; onEditing: (value: boolean) => void; onOverride: (value: string | null) => void }) {
  return <Collapsible className="asset-resolved-prompt"><CollapsibleTrigger><span>View prompt sent to Stable Audio</span><span>{compiling ? "Compiling…" : compilation?.model.replace("stable-audio-3-", "")}</span><ChevronDown /></CollapsibleTrigger><CollapsibleContent><div className="recipe-prompt-preview"><p>We translate your selections into a detailed English production prompt for Stable Audio 3.</p>{editing ? <><Textarea value={override ?? compilation?.compiled_prompt ?? ""} onChange={(event) => onOverride(event.target.value)} /><div><Button variant="ghost" size="sm" onClick={() => { onOverride(null); onEditing(false) }}><RotateCcw />Reset generated prompt</Button></div></> : <><blockquote>{compilation?.compiled_prompt || "Choose or describe a sound to build the prompt."}</blockquote><div><OperatorTooltip label="Copy model prompt" detail="Copies the exact English prompt currently compiled for Stable Audio."><Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(compilation?.compiled_prompt || "")}><Clipboard />Copy</Button></OperatorTooltip><Button variant="ghost" size="sm" onClick={() => { onOverride(compilation?.compiled_prompt || ""); onEditing(true) }}>Edit final prompt</Button></div></>}</div></CollapsibleContent></Collapsible>
}

function HistoryMenu({ history, selectedJobId, open, onOpenChange, onSelect }: { history: AudioGenerationHistoryItem[]; selectedJobId: string | null; open: boolean; onOpenChange: (value: boolean) => void; onSelect: (value: string) => void }) {
  return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild><Button variant="outline" className="asset-history-trigger" disabled={!history.length}><History /><span>{history.length ? `${history.length} variation${history.length === 1 ? "" : "s"}` : "No variations"}</span><ChevronDown /></Button></PopoverTrigger><PopoverContent align="end" className="asset-history-popover"><Command><CommandInput placeholder="Find a variation…" /><CommandList><CommandEmpty>No matching variation.</CommandEmpty><CommandGroup heading="Recent variations">{history.map((item, index) => { const label = String.fromCharCode(65 + index); const state = variationState(item); return <CommandItem key={item.job_id} value={`${candidateName(item)} ${state} ${item.request.seconds}`} onSelect={() => { onSelect(item.job_id); onOpenChange(false) }}><span className="asset-variation-letter">{label}</span><span className="asset-history-copy"><b>{candidateName(item)}</b><small>{item.request.seconds}s · {item.candidate?.seed ?? item.request.seed ?? "random seed"}</small></span><span className="asset-variation-state" data-state={state.toLocaleLowerCase()}>{state}</span>{selectedJobId === item.job_id && <Check />}</CommandItem> })}</CommandGroup></CommandList></Command></PopoverContent></Popover>
}

function CandidatePanel({ selected, candidate, selectedLabel, selectedActive, name, category, scope, tags, onName, onCategory, onScope, onTags, onError, onPlay, onRefine }: { selected: AudioGenerationHistoryItem | null; candidate: AudioGenerationHistoryItem["candidate"]; selectedLabel: string; selectedActive: boolean; name: string; category: AudioAssetCategory; scope: AudioAssetScope; tags: string[]; onName: (value: string) => void; onCategory: (value: AudioAssetCategory) => void; onScope: (value: AudioAssetScope) => void; onTags: (value: string[]) => void; onError: (value: string) => void; onPlay: (source: PlayerSource) => void; onRefine: () => void }) {
  if (!selected) return <section className="recipe-candidate-empty"><FileAudio /><b>No variations yet</b><p>Build the Recipe, generate temporary variations, then keep only what works.</p></section>
  return <section className="recipe-candidate"><header><small>Variation {selectedLabel}</small><b>{candidateName(selected)}</b></header><div className="asset-generation-audition"><span><FileAudio /></span><div><b>{candidateName(selected)}</b><small>{candidate ? `${formatDuration(candidate.duration_ms / 1000)} · WAV · seed ${candidate.seed}` : selected.error || selected.detail || "Temporary audio is unavailable"}</small></div>{candidate && <OperatorIconButton label={selectedActive ? "Pause variation" : "Audition variation"} detail="Auditioning does not create or place an Asset." onClick={() => onPlay({ key: `generated-candidate:${candidate.candidate_id}`, url: candidate.candidate_url, title: candidateName(selected), subtitle: `Temporary variation ${selectedLabel}`, kind: "asset" })}>{selectedActive ? <Pause /> : <Play />}</OperatorIconButton>}</div>{candidate && !selected.kept_asset ? <><div className="asset-variation-intent"><Button variant="outline" size="sm" onClick={onRefine}><RotateCcw />Refine this Recipe</Button></div><label className="asset-field"><span>Name</span><Input value={name} maxLength={120} onChange={(event) => onName(event.target.value)} /></label><AssetCategorySelect value={category} onChange={onCategory} /><AssetTagEditor tags={tags} onChange={onTags} onError={onError} /><AssetScopeSelect value={scope} onChange={onScope} /></> : selected.kept_asset ? <div className="asset-generation-kept"><Check /><span><b>Kept in Audio Library</b><small>{selected.kept_asset.name}</small></span></div> : isWorking(selected) ? <div className="asset-generation-progress"><Sparkles /><span><b>{selected.detail || "Generating audio…"}</b><small>{Math.round(selected.progress * 100)}% · continue working while it renders</small></span></div> : <div className="asset-generation-unavailable"><p>{selected.error || "This temporary variation was discarded or expired."}</p><Button variant="outline" size="sm" onClick={onRefine}>Restore Recipe</Button></div>}</section>
}
