import { useEffect, useMemo, useState } from "react"
import {
  Captions, Check, Clock3, Copy, FileAudio, Mic2, Pause, Pencil,
  Play, Trash2,
} from "lucide-react"

import { AudioWaveform } from "@/components/audio-waveform"
import { InlineDeliveryTags } from "@/components/inline-delivery-tags"
import { OperatorIconButton } from "@/components/operator-action"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { speechPartCardFacts } from "@/components/speech-part-card-model"
import { StoryRoleEditor } from "@/components/story-role-editor"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VoiceIdentity } from "@/components/voice-identity"
import { usePartDetailData } from "@/hooks/use-part-detail-data"
import { audioUrl } from "@/lib/api"
import { formatAuthoredRole, formatMoney, formatPartNumber, partDurationMs, textDirection } from "@/lib/format"
import type { DurableJob, GenerateResult, PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"

type InspectorTab = "script" | "recording" | "captions" | "timing" | "details"

function recordedWording(part: ProductionPart) {
  if (part.recording_text_state === "raw") return { label: "Original", text: part.clip_raw_text || "" }
  if (part.recording_text_state === "shaped") return { label: "Spoken", text: part.clip_spoken_text || "" }
  if (part.recording_text_state === "tagged") return { label: "Tagged", text: part.clip_tagged_text || "" }
  return { label: "Unknown", text: "" }
}

function availableTabs(part: ProductionPart): InspectorTab[] {
  if (part.kind === "silence") return ["timing", "details"]
  if (part.kind === "asset") return ["recording", "details"]
  if (!part.clip_id) return ["script", "details"]
  return ["script", "recording", "captions", "details"]
}

function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return <Button variant="ghost" size="sm" disabled={!text} onClick={() => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) })}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
}

function Fact({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return <div><dt>{label}</dt><dd className={mono ? "is-mono" : undefined}>{value === undefined || value === null || value === "" ? "—" : String(value)}</dd></div>
}

export function WorkstationPartInspector({ productionId, part, directory, playingKey, playerPlaying, onChanged, onPlay, onEdit, onDuplicate, onDelete, onOpenCaptions, onReplaceAsset }: {
  productionId: number
  part: ProductionPart
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onChanged: () => Promise<void>
  onPlay: (source: PlayerSource) => void
  onEdit: (part: ProductionPart) => void
  onDuplicate: (part: ProductionPart) => void
  onDelete: (part: ProductionPart) => void
  onOpenCaptions: (part: ProductionPart) => void
  onReplaceAsset: (part: ProductionPart) => void
}) {
  const tabs = useMemo(() => availableTabs(part), [part])
  const [tab, setTab] = useState<InspectorTab>(tabs[0] || "details")
  const data = usePartDetailData(productionId, part, onChanged)
  const facts = speechPartCardFacts({
    part,
    speechJob: part.speech_job as DurableJob<GenerateResult> | null,
    captionJob: part.caption_job || null,
    directory,
  })
  const wording = recordedWording(part)
  const role = formatAuthoredRole(part.authored_role)
  const currentPlaying = playerPlaying && playingKey === `part:${part.id}`
  const playable = part.kind === "asset" ? Boolean(part.filename && !part.missing) : facts.playable
  const source: PlayerSource = { key: `part:${part.id}`, url: audioUrl(part.filename || ""), title: part.kind === "asset" ? part.title || "Linked audio" : role || facts.selectedVoiceName, subtitle: `Part ${formatPartNumber(part.position ?? 0)} · ${facts.durationLabel}`, kind: part.kind === "asset" ? "asset" : "clip" }

  useEffect(() => { setTab(tabs[0] || "details") }, [part.id, tabs])

  return <div className="ws-part-inspector">
    <section className="ws-inspector-identity">
      <div className="ws-inspector-portrait">{part.kind === "silence" ? <Clock3 /> : part.kind === "asset" ? <FileAudio /> : <VoiceIdentity voice={part.catalogue_voice_id || part.voice || part.voice_name} identityId={part.voice_identity_id} directory={directory} gender={facts.voice.gender} showCopy={false} />}</div>
      <div className="ws-inspector-title-copy">
        <span>Part {formatPartNumber(part.position ?? 0)}{role ? ` · ${role}` : ""}</span>
        <h3>{part.kind === "silence" ? "Intentional pause" : part.kind === "asset" ? part.title || "Linked audio" : facts.selectedVoiceName}</h3>
        <p>{part.kind === "silence" ? "Editorial timing" : part.kind === "asset" ? "Venture audio asset" : facts.methodLine}</p>
      </div>
      {playable && <OperatorIconButton label={currentPlaying ? "Pause selected Part" : "Play selected Part"} variant="outline" size="icon" onClick={() => onPlay(source)}>{currentPlaying ? <Pause /> : <Play />}</OperatorIconButton>}
    </section>

    <dl className="ws-inspector-key-facts">
      <Fact label="Duration" value={facts.durationLabel} />
      {part.kind === "asset" ? <>
        <Fact label="Cost" value={part.cost > 0 ? formatMoney(part.cost) : "Free / reuse"} />
        <Fact label="Collection" value={part.asset_collection || part.asset_kind || "Venture audio"} />
        <Fact label="State" value={part.missing ? "Missing source" : "Linked"} />
      </> : <>
        <Fact label="Spend" value={facts.spendValue} />
        <Fact label="Language" value={part.language || "Unknown"} />
        <Fact label="State" value={facts.recorded ? facts.inputLabel || "Recorded" : "Draft"} />
      </>}
    </dl>

    <Tabs value={tab} onValueChange={(value) => setTab(value as InspectorTab)} className="ws-inspector-tabs">
      <TabsList variant="line">
        {tabs.map((value) => <TabsTrigger key={value} value={value}>{value === "timing" ? "Timing" : value.charAt(0).toUpperCase() + value.slice(1)}{value === "captions" && data.captions.length > 0 && <span>{data.captions.length}</span>}</TabsTrigger>)}
      </TabsList>
      <div className="ws-inspector-tab-scroll">
        <TabsContent value="script" className="ws-inspector-tab">
          <div className="ws-inspector-section-heading"><div><span>Story role</span>{data.roleBusy ? <b>Saving…</b> : <StoryRoleEditor value={part.authored_role} busy={data.roleBusy} onSave={data.saveRole} />}</div><CopyTextButton text={facts.script} /></div>
          <div className="ws-inspector-script" dir={textDirection(facts.script)}>{facts.scriptState === "tagged" ? <InlineDeliveryTags text={facts.script} /> : facts.script}</div>
          {facts.alerts.map((alert) => <p className={`ws-inspector-notice is-${alert.tone}`} key={alert.key}>{alert.label}</p>)}
        </TabsContent>

        <TabsContent value="recording" className="ws-inspector-tab">
          {part.kind === "asset" ? playable ? <>
            <div className="ws-inspector-waveform"><AudioWaveform url={part.filename ? audioUrl(part.filename) : undefined} bars={96} /><OperatorTooltip label={currentPlaying ? "Pause linked audio" : "Play linked audio"}><button aria-label={currentPlaying ? "Pause linked audio" : "Play linked audio"} onClick={() => onPlay(source)}>{currentPlaying ? <Pause /> : <Play />}</button></OperatorTooltip><span><b>{facts.durationLabel}</b><small>Venture source</small></span></div>
            <div className="ws-inspector-section-heading"><div><span>Reusable audio</span><b>{part.asset_collection || part.asset_kind || "Venture library"}</b></div></div>
            <p className="ws-inspector-script">This Part links to a reusable Venture audio asset. Replacing the source updates this placement without creating speech or provider spend.</p>
          </> : <div className="ws-inspector-empty"><FileAudio /><h3>Source unavailable</h3><p>Choose another Venture audio asset for this Part.</p></div> : facts.recorded ? <>
            <div className="ws-inspector-waveform"><AudioWaveform url={part.filename ? audioUrl(part.filename) : undefined} bars={96} /><OperatorTooltip label={currentPlaying ? "Pause recording" : "Play recording"}><button aria-label={currentPlaying ? "Pause recording" : "Play recording"} onClick={() => onPlay(source)}>{currentPlaying ? <Pause /> : <Play />}</button></OperatorTooltip><span><b>{facts.durationLabel}</b><small>{wording.label} input</small></span></div>
            <div className="ws-inspector-section-heading"><div><span>Words used for this recording</span><b>{wording.label}</b></div><CopyTextButton text={wording.text} /></div>
            <div className="ws-inspector-script" dir={textDirection(wording.text)}>{wording.text ? wording.label === "Tagged" ? <InlineDeliveryTags text={wording.text} /> : wording.text : "This historical recording does not contain a reliable wording snapshot."}</div>
          </> : <div className="ws-inspector-empty"><Mic2 /><h3>Not recorded yet</h3><p>The script is ready to open in Composer.</p></div>}
        </TabsContent>

        <TabsContent value="captions" className="ws-inspector-tab">
          <div className="ws-caption-summary"><Captions /><div><span>Timed text</span><h3>{data.loading ? "Loading captions…" : data.captions.length ? `${data.captions.length} caption file${data.captions.length === 1 ? "" : "s"}` : "No captions yet"}</h3><p>{facts.captionSummary}</p></div></div>
          {data.captions.length > 0 && <div className="ws-caption-language-list">{data.captions.map((caption) => <span key={caption.id}><b>{caption.language || "Unknown language"}</b><small>{caption.is_translation ? "Translation" : "Original"}{caption.stale ? " · needs review" : ""}</small></span>)}</div>}
          <Button onClick={() => onOpenCaptions(part)}><Captions /> Open caption workspace</Button>
        </TabsContent>

        <TabsContent value="timing" className="ws-inspector-tab">
          <div className="ws-inspector-empty"><Clock3 /><h3>{partDurationMs(part) / 1000} seconds</h3><p>This pause occupies real Production time and has no provider cost.</p></div>
        </TabsContent>

        <TabsContent value="details" className="ws-inspector-tab">
          {part.kind === "asset" ? <dl className="ws-inspector-details">
            <Fact label="Source" value="Venture audio asset" />
            <Fact label="Collection" value={part.asset_collection} />
            <Fact label="Asset kind" value={part.asset_kind} />
            <Fact label="Filename" value={part.filename} mono />
            <Fact label="Cost in Sequence" value={part.cost > 0 ? formatMoney(part.cost) : "Free / reuse"} />
            <Fact label="Asset ID" value={part.asset_id || part.asset_of} mono />
            <Fact label="Asset version" value={part.asset_version_id} mono />
          </dl> : <dl className="ws-inspector-details">
            <Fact label="Voice" value={facts.selectedVoiceName} />
            <Fact label="Model" value={facts.exactModel || facts.methodLine} />
            <Fact label="Provider" value={part.provider} />
            <Fact label="Tier" value={part.tier} />
            <Fact label="Capability" value={part.capability_name || part.capability_id} />
            <Fact label="Output language" value={part.language || "Unknown"} />
            <Fact label="Format" value={(part.format || "").toUpperCase()} />
            <Fact label="Active recording cost" value={formatMoney(part.cost)} />
          </dl>}
          <details className="ws-inspector-evidence"><summary>Technical evidence</summary><dl><Fact label="Part ID" value={part.public_id || part.id} mono />{part.kind === "asset" ? <><Fact label="Asset ID" value={part.asset_id || part.asset_of} mono /><Fact label="Asset version" value={part.asset_version_id} mono /></> : <><Fact label="Recording ID" value={part.clip_public_id} mono /><Fact label="Binding ID" value={part.binding_id} mono /><Fact label="Provider attempt" value={part.provider_attempt_id} mono /></>}</dl></details>
        </TabsContent>
      </div>
    </Tabs>

    {data.message && <p className="ws-inspector-message" role="status">{data.message}</p>}
    <footer className="ws-inspector-footer">
      {part.kind !== "silence" && part.kind !== "asset" && <Button onClick={() => onEdit(part)}><Pencil /> Edit in Composer</Button>}
      {part.kind === "asset" && <Button onClick={() => onReplaceAsset(part)}><FileAudio /> Replace source</Button>}
      <Button variant="outline" onClick={() => onDuplicate(part)}><Copy /> Duplicate</Button>
      <OperatorIconButton label="Delete selected Part" detail="Permanently removes this Part and its creative content." size="icon" className="is-danger" onClick={() => onDelete(part)}><Trash2 /></OperatorIconButton>
    </footer>
  </div>
}
