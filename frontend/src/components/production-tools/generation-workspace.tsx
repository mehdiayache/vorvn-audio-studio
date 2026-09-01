import {
  ArrowLeft, AudioLines, Check, ChevronDown, Clipboard, History,
  LoaderCircle, Music2, Pause, Play, RotateCcw, Sparkles, Trash2,
  WandSparkles, X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ActionButton, OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { studioApi } from "@/lib/api"
import { SoundMediaIcon } from "@/features/sound-scene/audio-presentation"
import { formatDuration } from "@/lib/format"
import type {
  AudioAssetCategory, AudioAssetScope, AudioGenerationHistoryItem,
  GeneratedKeepResult, PlayerSource, SoundRecipeCompilation,
  SoundRecipeNormalizationResult, SoundRecipeTaxonomy, VentureAsset,
} from "@/types/domain"

import type { AssetMode, GeneratedKeepInput } from "./asset-tool"
import { AssetCategorySelect, AssetScopeSelect, AssetTagEditor } from "./asset-library-controls"
import {
  RecipeField, SemanticScale, SingleChoice, TaxonomyPicker,
} from "./sound-recipe-controls"
import {
  emptySoundRecipe, inferKnownSelections, recipePath, recipeSummary,
  selectionLabels, taxonomyItems, updateRecipePath, valueId, valueLabel,
  type RecipeCapability, type RecipeInstrument, type SemanticValue,
  type SoundRecipe, type TaxonomyItem,
} from "./sound-recipe"

const MUSIC_STAGES = ["Use & Story", "Voice & Feeling", "Musical World", "Instruments", "Arrangement", "Sound & Space", "Output", "Review"]
const SFX_STAGES = ["Sound", "Action", "Perspective", "Character", "Avoid", "Output", "Review"]
type GenerationPhase = "compose" | "generating" | "compare" | "finalize"
type ComposeScreen = "setup" | "recipe"

function candidateName(item: AudioGenerationHistoryItem) {
  const prompt = item.request.resolved_prompt || ""
  const audiblePrompt = prompt.replace(/^TrackType:[^.]+\.\s*/i, "")
  const concise = audiblePrompt.split(/[.!?]/)[0]?.trim().slice(0, 72)
  return concise || (item.request.capability === "music" ? "Generated music" : "Generated sound effect")
}

function modelLabel(models: Record<string, unknown>, capability: RecipeCapability) {
  const model = models[capability]
  const id = model && typeof model === "object" && "id" in model ? String((model as { id?: unknown }).id || "") : ""
  if (!id) return "Audio generator"
  return id.split("-").map((part) => part === "sfx" ? "SFX" : part === "audio" ? "Audio" : part.charAt(0).toLocaleUpperCase() + part.slice(1)).join(" ")
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
  mode, productionId, spaceId, fixedCapability, allowPlacement = true,
  playingKey, playerPlaying, onPlay, onKeep, onKept,
}: {
  mode: AssetMode
  productionId?: number
  spaceId?: number
  fixedCapability?: RecipeCapability
  allowPlacement?: boolean
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onKeep: (folder: string, input: GeneratedKeepInput) => Promise<GeneratedKeepResult>
  onKept: (asset: VentureAsset, category: AudioAssetCategory, place: boolean) => Promise<void>
}) {
  const [capability, setCapability] = useState<RecipeCapability>(fixedCapability || "sfx")
  const [promptMode, setPromptMode] = useState<"simple" | "expert">("simple")
  const [composeScreen, setComposeScreen] = useState<ComposeScreen>(fixedCapability ? "recipe" : "setup")
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
  const [historySelection, setHistorySelection] = useState(false)
  const [phase, setPhase] = useState<GenerationPhase>("compose")
  const [sessionJobIds, setSessionJobIds] = useState<string[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [status, setStatus] = useState<"checking" | "ready" | "unavailable">("checking")
  const [models, setModels] = useState<Record<string, unknown>>({})
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [generationStage, setGenerationStage] = useState<"understanding" | "starting" | null>(null)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<AudioAssetCategory>("sfx")
  const [scope, setScope] = useState<AudioAssetScope>("space")
  const [tags, setTags] = useState<string[]>([])
  const [keeping, setKeeping] = useState<"place" | "library" | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const compileSequence = useRef(0)

  const recipe = recipes[capability]
  const items = useMemo(() => taxonomyItems(taxonomy), [taxonomy])
  const stages = capability === "music" ? MUSIC_STAGES : SFX_STAGES
  const capabilityHistory = useMemo(() => history.filter((item) => item.request.capability === capability), [history, capability])
  const selected = history.find((item) => item.job_id === selectedJobId) || null
  const sessionItems = useMemo(() => sessionJobIds.map((jobId) => history.find((item) => item.job_id === jobId)).filter(Boolean) as AudioGenerationHistoryItem[], [history, sessionJobIds])
  const candidate = selected?.candidate || null
  const anyWorking = history.some(isWorking)
  const unresolvedConflicts = compilation?.conflicts || []
  const generatedPrompt = compilation?.compiled_prompt || ""
  const generating = generationStage !== null
  const hasCreativeDirection = promptMode === "simple"
    ? Boolean(recipe.creative_brief.trim())
    : Boolean(recipe.creative_brief.trim() || recipeSummary(recipe, items).length)

  const setRecipe = (next: SoundRecipe | ((current: SoundRecipe) => SoundRecipe)) => {
    setRecipes((current) => ({
      ...current,
      [capability]: typeof next === "function" ? next(current[capability]) : next,
    }))
    setPromptOverride((current) => ({ ...current, [capability]: null }))
  }
  const setPath = (path: string, value: unknown) => setRecipe((current) => updateRecipePath(current, path, value))

  const refreshHistory = useCallback(async () => {
    if (!productionId && !spaceId) return
    try {
      const recent = spaceId
        ? await studioApi.recentAudioGenerationsForSpace(spaceId)
        : await studioApi.recentAudioGenerations(productionId!)
      setHistory(recent)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recent variations could not be loaded.")
    }
  }, [productionId, spaceId])

  useEffect(() => { void refreshHistory() }, [refreshHistory])
  useEffect(() => {
    if (!anyWorking && phase !== "generating") return
    const timer = window.setInterval(() => void refreshHistory(), 1200)
    return () => window.clearInterval(timer)
  }, [anyWorking, phase, refreshHistory])
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
      setModels(snapshot.models)
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
    if (!selected) return
    setName(candidateName(selected))
    setCategory(selected.request.capability === "music" ? "music" : "sfx")
    setTags([])
  }, [selectedJobId])
  useEffect(() => {
    if (phase !== "generating" || !sessionJobIds.length || sessionItems.length !== sessionJobIds.length) return
    if (!sessionItems.some(isWorking)) setPhase("compare")
  }, [phase, sessionItems, sessionJobIds])

  const changeMode = (nextMode: "simple" | "expert") => {
    if (nextMode === "expert") setRecipe((current) => inferKnownSelections(current, items))
    setPromptMode(nextMode)
  }

  const generate = async () => {
    if (!hasCreativeDirection || !generatedPrompt || unresolvedConflicts.length) return
    const createdJobIds: string[] = []
    setPhase("generating")
    setSelectedJobId(null)
    setHistorySelection(false)
    setSessionJobIds([])
    setGenerationStage("understanding"); setGenerationProgress(0); setError("")
    try {
      const normalized = await studioApi.normalizeSoundRecipe({
        capability,
        semantic_state: recipe,
        source_free_text: recipe.creative_brief,
        production_id: productionId,
        space_id: spaceId,
        confirmed: false,
      }) as SoundRecipeNormalizationResult
      const normalizedRecipe = normalized.semantic_state as SoundRecipe
      setRecipes((current) => ({ ...current, [capability]: normalizedRecipe }))
      setCompilation(normalized)
      setGenerationStage("starting")
      const count = normalizedRecipe.variation_count
      for (let index = 0; index < count; index += 1) {
        const semanticState = {
          ...normalizedRecipe,
          seed: normalizedRecipe.seed < 0 ? -1 : Math.min(2_147_483_647, normalizedRecipe.seed + index),
        }
        const job = await studioApi.enqueueAudioGeneration({
          capability,
          prompt: null,
          prompt_mode: promptMode,
          semantic_state: semanticState,
          source_free_text: normalizedRecipe.creative_brief,
          final_prompt_override: promptOverride[capability],
          authored_prompt: promptOverride[capability],
          generation_brief: null,
          seconds: normalizedRecipe.duration,
          seed: semanticState.seed < 0 ? null : semanticState.seed,
          production_id: productionId,
          space_id: spaceId,
        })
        createdJobIds.push(job.id)
        setSessionJobIds((current) => [...current, job.id])
        setGenerationProgress(index + 1)
      }
      await refreshHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio could not be generated.")
      if (!createdJobIds.length) setPhase("compose")
    } finally { setGenerationStage(null) }
  }

  const refine = (item: AudioGenerationHistoryItem) => {
    const nextCapability = item.request.capability as RecipeCapability
    const restored = item.request.semantic_state
      ? item.request.semantic_state as SoundRecipe
      : legacyRecipe(item)
    setCapability(fixedCapability || nextCapability)
    setRecipes((current) => ({ ...current, [nextCapability]: restored }))
    setPromptMode(item.request.prompt_mode as "simple" | "expert")
    setPromptOverride((current) => ({ ...current, [nextCapability]: null }))
    setSelectedJobId(null)
    setHistorySelection(false)
    setSessionJobIds([])
    setPhase("compose")
    setComposeScreen("recipe")
    setActiveStage(0); setError("")
  }

  const startFresh = () => {
    setRecipes((current) => ({ ...current, [capability]: emptySoundRecipe(capability) }))
    setPromptOverride((current) => ({ ...current, [capability]: null }))
    setPromptMode("simple")
    setActiveStage(0)
    setSelectedJobId(null)
    setHistorySelection(false)
    setSessionJobIds([])
    setPhase("compose")
    setComposeScreen(fixedCapability ? "recipe" : "setup")
    setError("")
  }

  const openHistoryItem = (jobId: string) => {
    const item = history.find((entry) => entry.job_id === jobId)
    if (!item) return
    setCapability(item.request.capability as RecipeCapability)
    setSelectedJobId(jobId)
    setHistorySelection(true)
    setSessionJobIds([jobId])
    setPhase("finalize")
    setError("")
  }

  const chooseCandidate = (jobId: string) => {
    setSelectedJobId(jobId)
    setHistorySelection(false)
    setPhase("finalize")
    setError("")
  }

  const keep = async (place: boolean) => {
    if (!candidate || !name.trim()) return
    setKeeping(place ? "place" : "library"); setError("")
    try {
      const kept = await onKeep(spaceId ? "Files" : "Assets", {
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
      setSelectedJobId(null)
      setHistorySelection(false)
      const remaining = sessionJobIds.filter((jobId) => jobId !== selected?.job_id)
      setSessionJobIds(remaining)
      setPhase(remaining.length ? "compare" : "compose")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That variation could not be discarded.")
    } finally { setDiscarding(false) }
  }

  const resolveConflict = (id: string, resolution: "structured" | "brief") => setRecipe((current) => ({
    ...current, conflict_resolutions: { ...current.conflict_resolutions, [id]: resolution },
  }))

  const statusCopy = status === "checking"
    ? "Checking generator…"
    : status !== "ready"
      ? reason
      : hasCreativeDirection
        ? "Ready to create"
        : `Describe the ${capability === "music" ? "music" : "sound"} before generating`
  const activeModelLabel = modelLabel(models, capability)
  const selectedIndex = selected ? sessionJobIds.indexOf(selected.job_id) : -1
  const selectedLabel = selectedIndex >= 0 ? String.fromCharCode(65 + selectedIndex) : ""
  const selectedActive = Boolean(candidate && playerPlaying && playingKey === `generated-candidate:${candidate.candidate_id}`)
  const stageSummary = (index: number) => capability === "music" ? [
    summaryFor(items, recipe, ["context", "moment", "cue_role"]),
    summaryFor(items, recipe, ["voice_relationship", "moods", "energy"]),
    summaryFor(items, recipe, ["genres", "harmonic_feel", "pace"]),
    (recipe.instruments as RecipeInstrument[]).map((item) => valueLabel(item.id, items)).join(" · "),
    summaryFor(items, recipe, ["arrangement.density", "arrangement.melody_prominence", "arrangement.percussion_presence"]),
    summaryFor(items, recipe, ["production.characters", "production.space", "cue_behaviour.ending"]),
    `${recipe.duration}s · ${recipe.variation_count} variation${recipe.variation_count === 1 ? "" : "s"}`,
    "",
  ][index] : [
    summaryFor(items, recipe, ["family", "source", "material"]),
    summaryFor(items, recipe, ["action", "motion"]),
    summaryFor(items, recipe, ["perspective", "environment"]),
    summaryFor(items, recipe, ["intensity", "character", "behaviour"]),
    summaryFor(items, recipe, ["constraints"]),
    `${recipe.duration}s · ${recipe.variation_count} variation${recipe.variation_count === 1 ? "" : "s"}`,
    "",
  ][index]

  return <section className="asset-view asset-generation-view" data-phase={phase}>
    <main className="asset-generation-stage">
      {phase === "compose" && <div className="asset-generation-compose" data-screen={composeScreen}>
        {composeScreen === "setup" && !fixedCapability ? <section className="asset-generation-setup">
          <header>
            <span className="asset-generation-provider"><Sparkles />{activeModelLabel}</span>
            <h2>What do you want to create?</h2>
            <p>Choose the audio and the amount of creative control. Both can be changed before generation.</p>
          </header>
          <div className="asset-generation-setup-choices">
            <section className="asset-generation-type-choice">
              <b>Audio type</b>
              <div className="asset-type-cards" role="group" aria-label="Audio type">
                <button type="button" className={capability === "sfx" ? "is-active" : ""} aria-label="Sound Effect" aria-pressed={capability === "sfx"} onClick={() => setCapability("sfx")}>
                  <span data-family="sfx"><SoundMediaIcon kind="sfx" /></span>
                  <div><strong>Sound Effect</strong><small>Foley, ambience, impacts and transitions</small></div>
                  <Check aria-hidden="true" />
                </button>
                <button type="button" className={capability === "music" ? "is-active" : ""} aria-label="Music" aria-pressed={capability === "music"} onClick={() => setCapability("music")}>
                  <span data-family="music"><SoundMediaIcon kind="music" /></span>
                  <div><strong>Music</strong><small>Beds, underscore, themes and stingers</small></div>
                  <Check aria-hidden="true" />
                </button>
              </div>
            </section>
            <section className="asset-generation-mode-choice">
              <b>Creation mode</b>
              <ChoiceSwitch left="Simple" right="Expert" checked={promptMode === "expert"} onCheckedChange={(checked) => changeMode(checked ? "expert" : "simple")} label="Creation mode" />
            </section>
          </div>
          <HistoryMenu history={capabilityHistory} selectedJobId={selectedJobId} open={historyOpen} onOpenChange={setHistoryOpen} onSelect={openHistoryItem} />
        </section> : <>
          <header className="asset-generation-context">
            {!fixedCapability && <Button variant="ghost" onClick={() => setComposeScreen("setup")}><ArrowLeft />Change setup</Button>}
            <div><b>{capability === "music" ? "Music" : "Sound Effect"}</b><span>·</span><b>{promptMode === "expert" ? "Expert" : "Simple"}</b><span>·</span><b>{activeModelLabel}</b></div>
            <HistoryMenu history={capabilityHistory} selectedJobId={selectedJobId} open={historyOpen} onOpenChange={setHistoryOpen} onSelect={openHistoryItem} />
          </header>

          {promptMode === "simple" ? <SimpleRecipe recipe={recipe} capability={capability} onChange={setRecipe} onOpenExpert={() => changeMode("expert")} /> : <section className="recipe-funnel">
            <nav className="recipe-step-rail" data-count={stages.length} aria-label={`${capability === "music" ? "Music" : "Sound Effect"} recipe steps`}>{stages.map((stage, index) => <button type="button" key={stage} className={activeStage === index ? "is-active" : ""} aria-current={activeStage === index ? "step" : undefined} onClick={() => setActiveStage(index)}><span>{index + 1}</span><b>{stage}</b></button>)}</nav>
            <article className="recipe-current-step">
              <header><span>Step {activeStage + 1} of {stages.length}</span><h3>{stages[activeStage]}</h3>{stageSummary(activeStage) && <p>{stageSummary(activeStage)}</p>}</header>
              <div className="recipe-current-step-fields">{capability === "music" ? <MusicStage index={activeStage} recipe={recipe} items={items} setPath={setPath} setRecipe={setRecipe} /> : <SfxStage index={activeStage} recipe={recipe} items={items} setPath={setPath} setRecipe={setRecipe} />}</div>
            </article>
          </section>}

          {(promptMode === "simple" || activeStage === stages.length - 1) && unresolvedConflicts.length > 0 && <section className="recipe-conflicts" aria-live="polite"><header><b>Choose the direction that should win</b><span>We will not send contradictory instructions.</span></header>{unresolvedConflicts.map((conflict) => <div key={conflict.id}><p><b>{conflict.structured}</b>{conflict.free_text && <><span>conflicts with</span><b>“{conflict.free_text}”</b></>}</p><div><Button variant="outline" size="sm" onClick={() => resolveConflict(conflict.id, "structured")}>Keep structured choice</Button>{conflict.free_text && <Button variant="outline" size="sm" onClick={() => resolveConflict(conflict.id, "brief")}>Keep brief wording</Button>}</div></div>)}</section>}

          {(promptMode === "simple" || activeStage === stages.length - 1) && <PromptPreview compilation={compilation} compiling={compiling} editing={editingPrompt} override={promptOverride[capability]} onEditing={setEditingPrompt} onOverride={(value) => setPromptOverride((current) => ({ ...current, [capability]: value }))} />}
        </>}
      </div>}

      {(phase === "generating" || phase === "compare") && <VariationWorkspace
        phase={phase}
        capability={capability}
        expectedCount={phase === "compare" ? Math.max(sessionJobIds.length, 1) : recipe.variation_count}
        items={sessionItems}
        playingKey={playingKey}
        playerPlaying={playerPlaying}
        onPlay={onPlay}
        onChoose={chooseCandidate}
      />}

      {phase === "finalize" && selected && <CandidateFinalizer
        selected={selected}
        selectedLabel={historySelection ? null : selectedLabel || "A"}
        selectedActive={selectedActive}
        name={name}
        category={category}
        scope={scope}
        showScope={!spaceId}
        tags={tags}
        onName={setName}
        onCategory={setCategory}
        onScope={setScope}
        onTags={setTags}
        onError={setError}
        onPlay={onPlay}
        onRefine={() => refine(selected)}
        onBack={() => setPhase(sessionJobIds.length > 1 ? "compare" : "compose")}
      />}
    </main>

    <footer className="asset-action-bar asset-generation-actions">
      <div>
        <b>{phase === "compose" ? composeScreen === "setup" ? "Start a new generation" : promptMode === "expert" ? `${stages[activeStage]} · Step ${activeStage + 1} of ${stages.length}` : capability === "music" ? "Create music" : "Create a sound effect" : phase === "generating" ? "Creating variations" : phase === "compare" ? "Choose what works" : candidate ? candidateName(selected!) : "Variation unavailable"}</b>
        <span>{phase === "generating" ? generationStage === "understanding" ? "Understanding the creative direction…" : generationStage === "starting" ? `Starting ${generationProgress} of ${recipe.variation_count}…` : `${sessionItems.filter((item) => item.candidate).length} of ${recipe.variation_count} ready` : phase === "compare" ? "Audition freely. Nothing is kept until you choose it." : phase === "finalize" ? "Name and file the chosen audio before keeping it." : composeScreen === "setup" ? "Choose an audio type and creation mode together." : promptMode === "expert" && activeStage < stages.length - 1 ? "Complete this focused screen, then continue." : statusCopy}</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {phase === "compose" && composeScreen === "setup" && !fixedCapability && <Button onClick={() => setComposeScreen("recipe")}>Continue</Button>}
      {phase === "compose" && composeScreen === "recipe" && promptMode === "expert" && activeStage > 0 && <Button variant="ghost" onClick={() => setActiveStage((current) => Math.max(0, current - 1))}><ArrowLeft />Back</Button>}
      {phase === "compose" && composeScreen === "recipe" && promptMode === "expert" && activeStage < stages.length - 1 && <Button onClick={() => setActiveStage((current) => Math.min(stages.length - 1, current + 1))}>Continue</Button>}
      {phase === "compose" && composeScreen === "recipe" && (promptMode === "simple" || activeStage === stages.length - 1) && <ActionButton busy={generating} busyLabel={generationStage === "understanding" ? "Understanding…" : "Starting…"} disabled={status !== "ready" || !hasCreativeDirection || !generatedPrompt || compiling || Boolean(unresolvedConflicts.length)} onClick={() => void generate()}><Sparkles />Generate {recipe.variation_count} variation{recipe.variation_count === 1 ? "" : "s"}</ActionButton>}
      {phase === "generating" && <div className="asset-generation-footer-progress"><Progress value={Math.max(generationProgress / recipe.variation_count, ...sessionItems.map((item) => item.progress)) * 100} /><span>{sessionItems.filter((item) => item.candidate).length}/{recipe.variation_count}</span></div>}
      {phase === "compare" && <><Button variant="outline" onClick={() => { setComposeScreen("recipe"); setPhase("compose") }}><ArrowLeft />Back to recipe</Button><Button variant="ghost" onClick={startFresh}>Start fresh</Button></>}
      {phase === "finalize" && candidate && !selected?.kept_asset && <><ActionButton variant="ghost" busy={discarding} busyLabel="Discarding…" disabled={Boolean(keeping)} onClick={() => void discard()}><Trash2 />Discard</ActionButton><ActionButton variant={allowPlacement ? "outline" : "default"} busy={keeping === "library"} busyLabel="Keeping…" disabled={Boolean(keeping) || discarding || !name.trim()} onClick={() => void keep(false)}><Check />Keep in Files</ActionButton>{allowPlacement && <ActionButton busy={keeping === "place"} busyLabel={mode === "sound" ? "Adding to track…" : "Inserting…"} disabled={Boolean(keeping) || discarding || !name.trim()} onClick={() => void keep(true)}><Check />{mode === "sound" ? "Keep & Add to Track" : "Keep & Insert"}</ActionButton>}</>}
      {phase === "finalize" && selected?.kept_asset && <Button onClick={startFresh}><Sparkles />Create another</Button>}
    </footer>
  </section>
}

function ChoiceSwitch({ left, right, checked, onCheckedChange, label }: { left: string; right: string; checked: boolean; onCheckedChange: (checked: boolean) => void; label: string }) {
  return <div className="asset-choice-switch" role="group" aria-label={label}>
    <button type="button" className={!checked ? "is-active" : ""} aria-pressed={!checked} onClick={() => onCheckedChange(false)}>{left}</button>
    <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={`${label}: ${checked ? right : left}`} />
    <button type="button" className={checked ? "is-active" : ""} aria-pressed={checked} onClick={() => onCheckedChange(true)}>{right}</button>
  </div>
}

function VariationWorkspace({ phase, capability, expectedCount, items, playingKey, playerPlaying, onPlay, onChoose }: {
  phase: "generating" | "compare"
  capability: RecipeCapability
  expectedCount: number
  items: AudioGenerationHistoryItem[]
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onChoose: (jobId: string) => void
}) {
  const slots = Array.from({ length: expectedCount }, (_, index) => items[index] || null)
  const readyCount = items.filter((item) => item.candidate).length
  return <section className="asset-variation-workspace" aria-live="polite">
    <header>
      <span className="asset-variation-workspace-icon">{phase === "generating" ? <LoaderCircle className="is-spinning" /> : <AudioLines />}</span>
      <div><h2>{phase === "generating" ? `Creating ${expectedCount} ${capability === "music" ? "music" : "sound"} variation${expectedCount === 1 ? "" : "s"}` : "Compare the variations"}</h2><p>{phase === "generating" ? "Each result will appear here as soon as it is ready." : "Listen in any order, then choose one to name and keep."}</p></div>
      <span className="asset-variation-count">{readyCount}/{expectedCount} ready</span>
    </header>
    <div className="asset-variation-grid" data-count={expectedCount}>
      {slots.map((item, index) => {
        const label = String.fromCharCode(65 + index)
        if (!item) return <article className="asset-variation-card is-waiting" key={`pending-${index}`}><header><span>{label}</span><b>Waiting to start</b></header><div className="asset-variation-card-wait"><LoaderCircle className="is-spinning" /><p>Preparing variation {label}</p></div></article>
        const itemCandidate = item.candidate
        const active = Boolean(itemCandidate && playerPlaying && playingKey === `generated-candidate:${itemCandidate.candidate_id}`)
        return <article className="asset-variation-card" data-state={itemCandidate ? "ready" : item.status} key={item.job_id}>
          <header><span>{label}</span><div><b>{candidateName(item)}</b><small>{itemCandidate ? `${formatDuration(itemCandidate.duration_ms / 1000)} · seed ${itemCandidate.seed}` : variationState(item)}</small></div>{itemCandidate && <OperatorIconButton label={active ? `Pause variation ${label}` : `Play variation ${label}`} detail="Auditioning does not keep or add this audio." onClick={() => onPlay({ key: `generated-candidate:${itemCandidate.candidate_id}`, url: itemCandidate.candidate_url, title: candidateName(item), sourceLabel: "AI preview", subtitle: `Temporary variation ${label}`, kind: "asset" })}>{active ? <Pause /> : <Play />}</OperatorIconButton>}</header>
          {isWorking(item) && <div className="asset-variation-card-progress"><Progress value={item.progress * 100} /><span>{item.detail || "Generating audio…"}</span></div>}
          {item.status === "failed" && <div className="asset-variation-card-error"><b>Generation failed</b><p>{item.error || "This variation could not be created."}</p></div>}
          {itemCandidate && <Button onClick={() => onChoose(item.job_id)}>Choose variation {label}</Button>}
        </article>
      })}
    </div>
  </section>
}

function CandidateFinalizer({ selected, selectedLabel, selectedActive, name, category, scope, showScope, tags, onName, onCategory, onScope, onTags, onError, onPlay, onRefine, onBack }: {
  selected: AudioGenerationHistoryItem
  selectedLabel: string | null
  selectedActive: boolean
  name: string
  category: AudioAssetCategory
  scope: AudioAssetScope
  showScope: boolean
  tags: string[]
  onName: (value: string) => void
  onCategory: (value: AudioAssetCategory) => void
  onScope: (value: AudioAssetScope) => void
  onTags: (value: string[]) => void
  onError: (value: string) => void
  onPlay: (source: PlayerSource) => void
  onRefine: () => void
  onBack: () => void
}) {
  const candidate = selected.candidate
  const selectionName = selectedLabel ? `Chosen variation ${selectedLabel}` : "Previous generation"
  const auditionName = selectedLabel ? `Variation ${selectedLabel}` : "Generated audio"
  const playerSubtitle = selectedLabel ? `Temporary variation ${selectedLabel}` : "Previous temporary generation"
  return <section className="asset-finalize-workspace">
    <header><Button variant="ghost" onClick={onBack}><ArrowLeft />Back</Button><div><span>{selectionName}</span><h2>Name and keep the audio</h2><p>The sound is still temporary. File it only when it is ready to reuse.</p></div></header>
    <div className="asset-finalize-layout">
      <section className="asset-finalize-audition">
        <div className="asset-finalize-wave"><AudioLines /></div>
        <div><span>{auditionName}</span><h3>{candidateName(selected)}</h3>{candidate && <p>{formatDuration(candidate.duration_ms / 1000)} · WAV · seed {candidate.seed}</p>}</div>
        {candidate && <OperatorIconButton label={selectedActive ? "Pause chosen variation" : "Play chosen variation"} detail="Listen again before keeping it." onClick={() => onPlay({ key: `generated-candidate:${candidate.candidate_id}`, url: candidate.candidate_url, title: candidateName(selected), sourceLabel: "AI preview", subtitle: playerSubtitle, kind: "asset" })}>{selectedActive ? <Pause /> : <Play />}</OperatorIconButton>}
        <Button variant="outline" onClick={onRefine}><RotateCcw />Refine recipe</Button>
      </section>
      {candidate && !selected.kept_asset && <section className="asset-finalize-form">
        <label className="asset-field"><span>Name</span><Input value={name} maxLength={120} onChange={(event) => onName(event.target.value)} autoFocus /></label>
        <div className="asset-finalize-fields"><AssetCategorySelect value={category} onChange={(next) => { if (next) onCategory(next) }} />{showScope && <AssetScopeSelect value={scope} onChange={onScope} />}</div>
        <AssetTagEditor tags={tags} onChange={onTags} onError={onError} />
      </section>}
      {selected.kept_asset && <section className="asset-generation-kept"><Check /><span><b>Saved as File</b><small>{selected.kept_asset.name}</small></span></section>}
      {!candidate && !selected.kept_asset && <section className="asset-generation-unavailable"><b>Variation unavailable</b><p>{selected.error || "This temporary variation was discarded or expired."}</p><Button variant="outline" onClick={onRefine}>Restore recipe</Button></section>}
    </div>
  </section>
}

function SimpleRecipe({ recipe, capability, onChange, onOpenExpert }: { recipe: SoundRecipe; capability: RecipeCapability; onChange: (recipe: SoundRecipe) => void; onOpenExpert: () => void }) {
  return <section className="recipe-simple">
    <header><span><WandSparkles /></span><div><h2>What should we hear?</h2><p>Describe the moment, the source, and how it should feel.</p></div></header>
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
  </>
  if (index === 6) return <GenerationSettings recipe={recipe} onChange={(next) => setRecipe(next)} capability="music" />
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
  </>
  if (index === 4) return <RecipeField label="What should never be introduced?" help="Choose exclusions that protect the intended sound without writing a negative prompt by hand."><TaxonomyPicker items={items} category="constraint" label="things to avoid" value={pathValues(recipe, "constraints")} onChange={(value) => setPath("constraints", value)} /></RecipeField>
  if (index === 5) return <GenerationSettings recipe={recipe} onChange={(next) => setRecipe(next)} capability="sfx" />
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
  return <section className="recipe-generation-settings"><header><b>Output</b></header><div><RecipeField label="Duration" help={`${capability === "music" ? "Music" : "Sound effects"} can be ${capability === "music" ? "5–120" : "1–30"} seconds long.`}><div className="recipe-duration"><Input type="number" min={capability === "music" ? 5 : 1} max={maximumDuration} value={recipe.duration} onChange={(event) => onChange({ ...recipe, duration: Math.min(maximumDuration, Number(event.target.value)) })} /><span>seconds</span></div></RecipeField><RecipeField label="Variations" help="Generate one focused result or several choices to compare."><ToggleGroup type="single" variant="outline" value={String(recipe.variation_count)} onValueChange={(value) => value && onChange({ ...recipe, variation_count: Number(value) as 1 | 2 | 4 })} aria-label="Number of variations"><ToggleGroupItem value="1">1</ToggleGroupItem><ToggleGroupItem value="2">2</ToggleGroupItem><ToggleGroupItem value="4">4</ToggleGroupItem></ToggleGroup></RecipeField></div><Collapsible className="recipe-advanced-settings"><CollapsibleTrigger><span>Advanced</span><ChevronDown /></CollapsibleTrigger><CollapsibleContent><RecipeField label="Seed" help="Leave empty for a new result. Reuse a seed when you want a closer repeat."><Input type="number" min={0} max={2_147_483_647} value={recipe.seed < 0 ? "" : recipe.seed} onChange={(event) => onChange({ ...recipe, seed: event.target.value ? Number(event.target.value) : -1 })} placeholder="Random" /></RecipeField></CollapsibleContent></Collapsible></section>
}

function RecipeReview({ recipe, items }: { recipe: SoundRecipe; items: TaxonomyItem[] }) {
  const summary = recipeSummary(recipe, items)
  return <section className="recipe-review"><header><span><Sparkles /></span><div><h3>Your {recipe.model_type === "music" ? "music" : "sound"}</h3><p>Read the production brief as a whole. Jump back to any step if something feels wrong.</p></div></header>{recipe.creative_brief && <blockquote>{recipe.creative_brief}</blockquote>}<dl>{summary.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.values.join(" · ")}</dd></div>)}</dl><div className="recipe-review-settings"><span>{recipe.duration}s</span><span>{recipe.variation_count} variation{recipe.variation_count === 1 ? "" : "s"}</span><span>{recipe.seed < 0 ? "Random seeds" : `Seed ${recipe.seed}`}</span></div></section>
}

function PromptPreview({ compilation, compiling, editing, override, onEditing, onOverride }: { compilation: SoundRecipeCompilation | null; compiling: boolean; editing: boolean; override: string | null; onEditing: (value: boolean) => void; onOverride: (value: string | null) => void }) {
  return <Collapsible className="asset-resolved-prompt"><CollapsibleTrigger><span>View prompt sent to Stable Audio</span><span>{compiling ? "Compiling…" : compilation?.model.replace("stable-audio-3-", "")}</span><ChevronDown /></CollapsibleTrigger><CollapsibleContent><div className="recipe-prompt-preview"><p>We translate your selections into a detailed English production prompt for Stable Audio 3.</p>{editing ? <><Textarea value={override ?? compilation?.compiled_prompt ?? ""} onChange={(event) => onOverride(event.target.value)} /><div><Button variant="ghost" size="sm" onClick={() => { onOverride(null); onEditing(false) }}><RotateCcw />Reset generated prompt</Button></div></> : <><blockquote>{compilation?.compiled_prompt || "Choose or describe a sound to build the prompt."}</blockquote><div><OperatorTooltip label="Copy model prompt" detail="Copies the exact English prompt currently compiled for Stable Audio."><Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(compilation?.compiled_prompt || "")}><Clipboard />Copy</Button></OperatorTooltip><Button variant="ghost" size="sm" onClick={() => { onOverride(compilation?.compiled_prompt || ""); onEditing(true) }}>Edit final prompt</Button></div></>}</div></CollapsibleContent></Collapsible>
}

function HistoryMenu({ history, selectedJobId, open, onOpenChange, onSelect }: { history: AudioGenerationHistoryItem[]; selectedJobId: string | null; open: boolean; onOpenChange: (value: boolean) => void; onSelect: (value: string) => void }) {
  return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger asChild><Button variant="outline" className="asset-history-trigger" aria-label="Previous generations" disabled={!history.length}><History /><span>Previous generations</span>{history.length > 0 && <b>{history.length}</b>}<ChevronDown /></Button></PopoverTrigger><PopoverContent align="end" className="asset-history-popover"><Command><CommandInput placeholder="Find a previous generation…" /><CommandList><CommandEmpty>No matching generation.</CommandEmpty><CommandGroup heading="Previous generations">{history.map((item) => { const state = variationState(item); return <CommandItem key={item.job_id} value={`${candidateName(item)} ${state} ${item.request.seconds}`} onSelect={() => { onSelect(item.job_id); onOpenChange(false) }}><span className="asset-history-icon"><History /></span><span className="asset-history-copy"><b>{candidateName(item)}</b><small>{item.request.seconds}s · {item.candidate?.seed ?? item.request.seed ?? "random seed"}</small></span><span className="asset-variation-state" data-state={state.toLocaleLowerCase()}>{state}</span>{selectedJobId === item.job_id && <Check />}</CommandItem> })}</CommandGroup></CommandList></Command></PopoverContent></Popover>
}
