import {
  AlertCircle, ArrowLeft, ArrowRight, Braces, Check, ClipboardPaste,
  Download, FileJson2, LoaderCircle, Plus, Sparkles, WandSparkles,
} from "lucide-react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { VoicePicker } from "@/components/voice-picker"
import { ActionButton } from "@/components/operator-action"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { jobObserver } from "@/lib/job-observer"
import { studioApi } from "@/lib/api"
import { audioStudioBase } from "@/lib/links"
import { formatDuration, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getVoiceIdentities, type VoiceChoice, type VoiceIdentityChoice } from "@/lib/voice-options"
import type { DurableJob, PlayerSource, StudioConfig, VoiceDirectory } from "@/types/domain"
import {
  decodeProductionImportJson, PRODUCTION_IMPORT_EXAMPLE,
  type ProductionImportPlan, type ProductionImportResult,
  type ProductionImportRoute, type ProductionImportValidation,
} from "./production-import"

import "@/components/production-tools/production-tools.css"

type Parent = { type: "project" | "series"; id: number; name: string }
type Existing = {
  id: number
  publicId: string
  name: string
  description: string
  partCount: number
  parent: Parent
}
type Stage = "source" | "destination" | "voices" | "preparation" | "review" | "running"
type DestinationChoice = "current" | "new"
type MetadataChoice = "current" | "json" | "custom"
type TextVersion = "imported" | "spoken_1" | "spoken_2"
type TagDensity = "none" | "light" | "normal" | "heavy"

const stages: { id: Exclude<Stage, "running">; label: string }[] = [
  { id: "source", label: "Document" },
  { id: "destination", label: "Destination" },
  { id: "voices", label: "Voices" },
  { id: "preparation", label: "Prepare" },
  { id: "review", label: "Review" },
]

function routeLabel(route: VoiceChoice) {
  const method = route.capabilities.map((item) => item.name).join(", ")
  return [route.provider, route.modelId || route.model, method].filter(Boolean).join(" · ")
}

function formatEstimatedDuration(milliseconds: number) {
  return formatDuration(milliseconds / 1000)
}

function routeForCapability(identity: VoiceIdentityChoice | undefined, capabilityId: string, routeId?: string) {
  const candidates = (identity?.routes || []).filter((route) =>
    route.source === "owned" && route.bindingId && route.capabilities.some((item) => item.id === capabilityId))
  return candidates.find((route) => route.id === routeId) || candidates[0]
}

function ChoiceCard({ selected, title, description, icon, onClick }: {
  selected: boolean
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return <button type="button" className={cn("import-choice-card", selected && "is-selected")} aria-pressed={selected} onClick={onClick}>
    <span className="import-choice-icon">{icon}</span>
    <span><b>{title}</b><small>{description}</small></span>
    <span className="import-choice-check">{selected && <Check />}</span>
  </button>
}

function WizardRail({ stage }: { stage: Stage }) {
  const current = stage === "running" ? stages.length : stages.findIndex((item) => item.id === stage)
  return <ol className="production-import-rail" aria-label="Import progress">
    {stages.map((item, index) => <li key={item.id} className={cn(index === current && "is-current", index < current && "is-complete")}>
      <span>{index < current ? <Check /> : index + 1}</span><b>{item.label}</b>
    </li>)}
  </ol>
}

function JobProgressView({ jobId }: { jobId: string }) {
  const job = useSyncExternalStore(
    (listener) => jobObserver.subscribe(jobId, listener),
    () => jobObserver.getSnapshot<ProductionImportResult>(jobId),
  )
  const percent = Math.round((job?.progress || 0) * 100)
  return <div className="production-import-running" role="status" aria-live="polite">
    <span className="import-running-icon"><LoaderCircle className="spin" /></span>
    <div><span className="eyebrow">Preparing Production</span><h3>{job?.detail || "Starting import…"}</h3><p>The Production is durable. You can safely leave this dialog after it opens.</p></div>
    <Progress value={percent} />
    <b>{percent}%</b>
  </div>
}

export function ProductionImportTool({ existing, newParent, config, directory, playingKey, playerPlaying, onPlay, onCancel, onCompleted }: {
  existing?: Existing
  newParent?: Parent
  config: StudioConfig | null
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onCancel: () => void
  onCompleted?: (result: ProductionImportResult) => void
}) {
  const [stage, setStage] = useState<Stage>("source")
  const [file, setFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<ProductionImportValidation | null>(null)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pastedJson, setPastedJson] = useState("")
  const [destinationChoice, setDestinationChoice] = useState<DestinationChoice>(existing ? "current" : "new")
  const [metadataChoice, setMetadataChoice] = useState<MetadataChoice>(existing ? "current" : "json")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [roleIdentities, setRoleIdentities] = useState<Record<string, string>>({})
  const [roleRouteIds, setRoleRouteIds] = useState<Record<string, string>>({})
  const [capabilityId, setCapabilityId] = useState("expressive_tags")
  const [language, setLanguage] = useState("")
  const [textVersion, setTextVersion] = useState<TextVersion>("spoken_1")
  const [tagDensity, setTagDensity] = useState<TagDensity>("normal")
  const [outputFormat, setOutputFormat] = useState<"mp3" | "mp3-24k" | "wav" | "opus">("mp3")
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const identities = useMemo(() => getVoiceIdentities(
    directory.registry ?? null, directory.identities).filter((identity) => identity.source === "owned"),
  [directory.identities, directory.registry])
  const capabilities = useMemo(() => {
    const found = new Map<string, string>()
    for (const identity of identities) for (const route of identity.routes) {
      for (const capability of route.capabilities) found.set(capability.id, capability.name)
    }
    return [...found].map(([id, name]) => ({ id, name }))
  }, [identities])
  const selectedCapability = capabilities.find((item) => item.id === capabilityId)
  const selectedRoutes = validation?.summary.roles.map((role) => {
    const identity = identities.find((item) => item.identityId === roleIdentities[role.name])
    return routeForCapability(identity, capabilityId, roleRouteIds[role.name])
  }) ?? []
  const rolesReady = Boolean(validation && selectedRoutes.every(Boolean))
  const supportsTags = selectedRoutes.length > 0 && selectedRoutes.every((route) =>
    route?.capabilities.some((capability) =>
      capability.id === capabilityId && capability.controls.delivery_tags === true))
  const usesTextTools = textVersion !== "imported" || (supportsTags && tagDensity !== "none")
  const estimatedTextToolCost = usesTextTools && validation
    && config?.text_preparation?.estimated_price_per_million_characters
    ? validation.document.items.reduce((total, item) =>
      total + (item.type === "speech" ? item.text.length : 0), 0) / 1_000_000
      * config.text_preparation.estimated_price_per_million_characters
    : 0
  const parent = destinationChoice === "current" ? existing?.parent : newParent || existing?.parent
  const exampleHref = `data:application/json;charset=utf-8,${encodeURIComponent(`${JSON.stringify(PRODUCTION_IMPORT_EXAMPLE, null, 2)}\n`)}`

  async function validate(source: string) {
    setChecking(true); setError(""); setValidation(null)
    try {
      const checked = await studioApi.validateProductionImport(decodeProductionImportJson(source))
      setValidation(checked)
      if (existing) {
        setDestinationChoice("current")
        setMetadataChoice("current")
        setTitle(existing.name)
        setDescription(existing.description)
      } else {
        setDestinationChoice("new")
        setMetadataChoice("json")
        setTitle(checked.document.title)
        setDescription(checked.document.description || "")
      }
      setLanguage(checked.document.language || config?.languages.find((item) => item !== "Auto") || "English")
      const defaultMethod = capabilities.some((item) => item.id === "expressive_tags")
        ? "expressive_tags" : capabilities[0]?.id || ""
      setCapabilityId(defaultMethod)
      setRoleIdentities({}); setRoleRouteIds({})
      setStage("destination")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This Production document could not be validated.")
    } finally { setChecking(false) }
  }

  async function choose(next: File) {
    setFile(next); setPasting(false); setError("")
    if (!next.name.toLocaleLowerCase().endsWith(".json")) { setError("Choose a .json Production document."); return }
    if (next.size > 5_000_000) { setError("This JSON file is larger than 5 MB."); return }
    await validate(await next.text())
  }

  function selectIdentity(role: string, identity: VoiceIdentityChoice) {
    const route = routeForCapability(identity, capabilityId)
    setRoleIdentities((current) => ({ ...current, [role]: identity.identityId }))
    setRoleRouteIds((current) => ({ ...current, [role]: route?.id || "" }))
  }

  function chooseMethod(next: string) {
    setCapabilityId(next)
    setRoleRouteIds((current) => Object.fromEntries(Object.entries(roleIdentities).map(([role, identityId]) => {
      const identity = identities.find((item) => item.identityId === identityId)
      return [role, routeForCapability(identity, next, current[role])?.id || ""]
    })))
  }

  function chooseMetadata(next: Exclude<MetadataChoice, "custom">) {
    if (!validation) return
    setMetadataChoice(next)
    if (next === "current" && existing) {
      setTitle(existing.name)
      setDescription(existing.description)
      return
    }
    setTitle(validation.document.title)
    setDescription(validation.document.description || "")
  }

  function roleRoutes(): Record<string, ProductionImportRoute> {
    if (!validation) return {}
    return Object.fromEntries(validation.summary.roles.map((role) => {
      const identity = identities.find((item) => item.identityId === roleIdentities[role.name])
      const route = routeForCapability(identity, capabilityId, roleRouteIds[role.name])
      if (!identity || !route?.bindingId) throw new Error(`Choose a compatible Voice route for ${role.name}.`)
      return [role.name, {
        voice_identity_id: identity.identityId,
        binding_id: route.bindingId,
        capability_id: capabilityId,
      }]
    }))
  }

  async function execute() {
    if (!validation || !parent || !title.trim() || !rolesReady) return
    setSubmitting(true); setError("")
    try {
      const plan: ProductionImportPlan = {
        document: validation.document,
        destination: destinationChoice === "current" && existing
          ? { kind: "existing", production_id: existing.id }
          : { kind: "new", parent_type: parent.type, parent_id: parent.id },
        title: title.trim(), description: description.trim(),
        role_routes: roleRoutes(),
        preparation: { text_version: textVersion, tag_density: supportsTags ? tagDensity : "none", output_format: outputFormat, language },
      }
      const job = await studioApi.enqueueProductionImport<ProductionImportResult>(plan)
      setJobId(job.id); setStage("running")
      const result = await studioApi.productionImportResult<ProductionImportResult>(job.id)
      toast.success(`${result.title} is ready to review`, { description: `${result.speech} Speech Drafts · ${result.silence} Pauses` })
      onCompleted?.(result)
      window.location.assign(`${audioStudioBase}/productions/${result.production_public_id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The Production import could not finish.")
      setStage("review")
    } finally { setSubmitting(false) }
  }

  const currentIndex = stages.findIndex((item) => item.id === stage)
  const canContinue = stage === "destination" ? Boolean(title.trim() && parent)
    : stage === "voices" ? rolesReady
    : stage === "preparation" ? Boolean(language)
    : true
  const next = () => {
    if (stage === "destination") setStage("voices")
    else if (stage === "voices") setStage("preparation")
    else if (stage === "preparation") setStage("review")
  }
  const back = () => {
    if (stage === "destination") setStage("source")
    else if (stage === "voices") setStage("destination")
    else if (stage === "preparation") setStage("voices")
    else if (stage === "review") setStage("preparation")
  }

  return <div className="production-import-tool">
    <WizardRail stage={stage} />
    <div className="production-import-body">
      {stage === "source" && <section className="import-stage import-source-stage">
        <header><span className="eyebrow">Production document</span><h2>Bring in the authored story</h2><p>Auvi Studio validates the structure. Voice, method and delivery are chosen here—not inherited silently from JSON.</p></header>
        <FileDropZone file={file} accept="application/json,.json" kind="file" emptyLabel="Drop a Production JSON here" chooseLabel={checking ? "Checking…" : "Choose JSON"} hint="V1 · Speech and Pause · maximum 5 MB" disabled={checking} onFile={(next) => void choose(next)} />
        <div className="production-import-source-actions">
          <Button type="button" variant="outline" size="sm" disabled={checking} onClick={() => { setPasting((current) => !current); setFile(null); setError("") }}><ClipboardPaste /> {pasting ? "Hide paste" : "Paste JSON"}</Button>
          <Button variant="ghost" size="sm" asChild><a href={exampleHref} download="auvi-production-import-v1-example.json"><Download /> Download example</a></Button>
        </div>
        {pasting && <div className="production-import-paste"><Textarea aria-label="Paste Production JSON" value={pastedJson} placeholder="Paste the complete Production JSON document…" disabled={checking} onChange={(event) => setPastedJson(event.target.value)} /><ActionButton busy={checking} busyLabel="Checking…" disabled={!pastedJson.trim()} onClick={() => void validate(pastedJson)}>Check document</ActionButton></div>}
        {!error && <p className="production-import-idle"><Braces /> The backend checks one canonical contract. Nothing is created yet.</p>}
      </section>}

      {stage === "destination" && validation && <section className="import-stage">
        <header><span className="eyebrow">Validated document</span><h2>{validation.document.title}</h2><p>{validation.summary.speech} Speech · {validation.summary.silence} Pause · about {formatEstimatedDuration(validation.summary.estimated_duration_ms)}</p></header>
        {existing && <div className="import-choice-grid">
          <ChoiceCard selected={destinationChoice === "current"} title={`Add to ${existing.name}`} description={existing.partCount ? `Append after its ${existing.partCount} current Parts.` : "Use this empty Production."} icon={<Plus />} onClick={() => { setDestinationChoice("current"); chooseMetadata("current") }} />
          <ChoiceCard selected={destinationChoice === "new"} title="Create a new Production" description={`Keep ${existing.name} unchanged.`} icon={<FileJson2 />} onClick={() => { setDestinationChoice("new"); chooseMetadata("json") }} />
        </div>}
        {destinationChoice === "current" && existing && <div className="import-metadata-choice">
          <span>Production details</span>
          <div className="import-choice-grid">
            <ChoiceCard selected={metadataChoice === "current"} title="Keep current details" description={existing.name} icon={<Check />} onClick={() => chooseMetadata("current")} />
            <ChoiceCard selected={metadataChoice === "json"} title="Use JSON details" description={validation.document.title} icon={<Braces />} onClick={() => chooseMetadata("json")} />
          </div>
        </div>}
        <div className="import-metadata-fields">
          <label><span>Production title</span><Input value={title} maxLength={160} onChange={(event) => { setMetadataChoice("custom"); setTitle(event.target.value) }} /></label>
          <label><span>Description <small>optional</small></span><Textarea value={description} maxLength={2000} onChange={(event) => { setMetadataChoice("custom"); setDescription(event.target.value) }} placeholder="What is this Production for?" /></label>
        </div>
        {destinationChoice === "current" && existing?.partCount ? <div className="import-attention"><AlertCircle /><span><b>This Production already has {existing.partCount} Parts.</b>The imported Parts will be appended in document order. Nothing existing is replaced.</span></div> : null}
      </section>}

      {stage === "voices" && validation && <section className="import-stage import-voices-stage">
        <header><span className="eyebrow">Casting and recording</span><h2>Choose the real Voice routes</h2><p>One method applies to this import. Every role still gets its own exact owned Voice binding.</p></header>
        <label className="import-method-field"><span>Recording method</span><Select value={capabilityId} onValueChange={chooseMethod}><SelectTrigger><SelectValue placeholder="Choose method" /></SelectTrigger><SelectContent>{capabilities.map((capability) => <SelectItem value={capability.id} key={capability.id}>{capability.name}</SelectItem>)}</SelectContent></Select></label>
        <div className="production-import-roles">{validation.summary.roles.map((role) => {
          const identity = identities.find((item) => item.identityId === roleIdentities[role.name])
          const candidates = (identity?.routes || []).filter((route) => route.bindingId && route.capabilities.some((item) => item.id === capabilityId))
          const selectedRoute = routeForCapability(identity, capabilityId, roleRouteIds[role.name])
          return <article className="production-import-role" key={role.name}>
            <div className="import-role-name"><b>{role.name}</b><span>{role.count} Speech Part{role.count === 1 ? "" : "s"}</span></div>
            <VoicePicker identities={identities} value={identity?.identityId || ""} directory={directory} label={`Choose Voice for ${role.name}`} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onChange={(nextIdentity) => selectIdentity(role.name, nextIdentity)} />
            <div className={cn("import-route-truth", identity && !selectedRoute && "is-error")}>
              {!identity ? <span>Choose a Voice</span> : !selectedRoute ? <span>This Voice does not support {selectedCapability?.name || "this method"}.</span> : candidates.length > 1 ? <Select value={selectedRoute.id} onValueChange={(value) => setRoleRouteIds((current) => ({ ...current, [role.name]: value }))}><SelectTrigger aria-label={`Exact route for ${role.name}`}><SelectValue /></SelectTrigger><SelectContent>{candidates.map((route) => <SelectItem value={route.id} key={route.id}>{routeLabel(route)}</SelectItem>)}</SelectContent></Select> : <><Check /><span>{routeLabel(selectedRoute)}</span><b>Ready</b></>}
            </div>
          </article>
        })}</div>
        {!identities.length && <div className="import-attention"><AlertCircle /><span><b>No ready owned Voice</b>Create or restore a Voice binding before importing Speech.</span></div>}
      </section>}

      {stage === "preparation" && validation && <section className="import-stage">
        <header><span className="eyebrow">Text preparation</span><h2>Choose how the authored words become speech-ready</h2><p>These are revisable text proposals. No audio is generated during import.</p></header>
        <div className="import-preparation-section"><h3>Text version</h3><div className="import-choice-grid three">
          <ChoiceCard selected={textVersion === "imported"} title="Keep imported" description="Use the authored text exactly as supplied." icon={<FileJson2 />} onClick={() => setTextVersion("imported")} />
          <ChoiceCard selected={textVersion === "spoken_1"} title="Spoken 1" description="Conservative spoken phrasing." icon={<WandSparkles />} onClick={() => setTextVersion("spoken_1")} />
          <ChoiceCard selected={textVersion === "spoken_2"} title="Spoken 2" description="Stronger performance shaping." icon={<Sparkles />} onClick={() => setTextVersion("spoken_2")} />
        </div></div>
        <div className="import-preparation-row">
          <label><span>Delivery tags</span><Select value={supportsTags ? tagDensity : "none"} disabled={!supportsTags} onValueChange={(value) => setTagDensity(value as TagDensity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="heavy">Heavy</SelectItem></SelectContent></Select><small>{supportsTags ? `Supported by ${selectedCapability?.name}.` : "This recording method does not support delivery tags."}</small></label>
          <label><span>Output language</span><Select value={language} onValueChange={setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(config?.languages || ["English"]).map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select><small>Per-item JSON language overrides still remain explicit.</small></label>
          <label><span>Future recording format</span><Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as typeof outputFormat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["mp3", "mp3-24k", "wav", "opus"] as const).map((item) => <SelectItem value={item} key={item}>{item.toUpperCase()}</SelectItem>)}</SelectContent></Select><small>Stored on Drafts for the later recording action.</small></label>
        </div>
      </section>}

      {stage === "review" && validation && <section className="import-stage import-review-stage">
        <header><span className="eyebrow">Preflight</span><h2>Review the Production before preparing it</h2><p>This creates editable Draft truth. Audio generation remains a separate operator action.</p></header>
        <dl className="import-preflight">
          <div><dt>Production</dt><dd>{title}</dd></div><div><dt>Destination</dt><dd>{destinationChoice === "current" ? existing?.name : parent?.name}</dd></div>
          <div><dt>Sequence</dt><dd>{validation.summary.speech} Speech · {validation.summary.silence} Pause</dd></div><div><dt>Estimated duration</dt><dd>{formatEstimatedDuration(validation.summary.estimated_duration_ms)}</dd></div>
          <div><dt>Roles</dt><dd>{validation.summary.roles.map((role) => role.name).join(", ")}</dd></div><div><dt>Method</dt><dd>{selectedCapability?.name || capabilityId}</dd></div>
          <div><dt>Text</dt><dd>{textVersion === "imported" ? "Imported" : textVersion === "spoken_1" ? "Spoken 1" : "Spoken 2"}</dd></div><div><dt>Delivery tags</dt><dd>{supportsTags ? tagDensity : "None"}</dd></div>
          <div><dt>Language</dt><dd>{language}</dd></div><div><dt>Format</dt><dd>{outputFormat.toUpperCase()}</dd></div>
        </dl>
        {validation.summary.legacy_generation_hints > 0 && <div className="import-attention is-neutral"><Braces /><span><b>{validation.summary.legacy_generation_hints} legacy generation hint{validation.summary.legacy_generation_hints === 1 ? "" : "s"} found</b>They are intentionally ignored. The visible choices above are the only configuration Auvi Studio will apply.</span></div>}
        {usesTextTools && <p className="import-cost-note">Text preparation uses {config?.text_preparation?.model || "the configured text model"}. Estimated text-tool cost is shown and protected by Spend Guard when applicable.</p>}
      </section>}

      {stage === "running" && jobId && <JobProgressView jobId={jobId} />}
      {error && <div className="production-import-error" role="alert"><AlertCircle /><span><b>Import not ready</b>{error}</span></div>}
    </div>
    <DialogFooter className="production-import-footer">
      <span>{validation ? `${validation.summary.items} Parts · about ${formatEstimatedDuration(validation.summary.estimated_duration_ms)}${estimatedTextToolCost ? ` · text tools about ${formatMoney(estimatedTextToolCost)}` : ""}` : "No Production is changed until the final confirmation."}</span>
      {stage !== "running" && <Button type="button" variant="outline" disabled={submitting || checking} onClick={currentIndex > 0 ? back : onCancel}>{currentIndex > 0 ? <><ArrowLeft /> Back</> : "Cancel"}</Button>}
      {stage !== "source" && stage !== "review" && stage !== "running" && <Button type="button" disabled={!canContinue} onClick={next}>Continue <ArrowRight /></Button>}
      {stage === "review" && <ActionButton busy={submitting} busyLabel="Starting…" disabled={!rolesReady || !title.trim()} onClick={() => void execute()}>{destinationChoice === "current" ? `Import and prepare ${validation?.summary.items || 0} Parts` : `Create Production and import ${validation?.summary.items || 0} Parts`}</ActionButton>}
    </DialogFooter>
  </div>
}
