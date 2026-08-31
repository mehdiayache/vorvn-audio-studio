import { CheckCircle2, CloudDownload, Film, Image as ImageIcon, Library, PanelLeftClose, PanelLeftOpen, Pause, Play, Plus, Search, Sparkles, Upload, Waves, X } from "lucide-react"
import { memo, useMemo, useState, type ReactNode } from "react"

import { AudioWaveform } from "@/components/audio-waveform"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperatorIconButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { SoundMediaIcon, soundClipMediaKind } from "@/features/sound-scene/audio-presentation"
import { soundClipSourceUrl } from "@/features/sound-scene/engine/sound-clip-source"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PlayerSource, VentureAsset, VisualSceneDocument } from "@/types/domain"
import { TimelineViewer } from "./timeline-viewer"
import type { WorkstationSelection } from "./workstation-selection"

type MediaFilter = "all" | "image" | "video" | "audio"
type ScopeFilter = "production" | "venture" | "studio"

function assetLabel(asset: VentureAsset) {
  return String(asset.name || asset.title || asset.filename || "Untitled media")
}

function assetOrigin(asset: VentureAsset) {
  const metadata = { ...(asset.metadata || {}), ...(asset.version_metadata || {}) }
  if (metadata.origin === "director-generation" || metadata.generated === true || metadata.generator) return "generated"
  if (String(metadata.provider || metadata.source || "").toLowerCase().includes("freesound")) return "freesound"
  return "uploaded"
}

const TimelineMediaBrowser = memo(function TimelineMediaBrowser({ assets, productionAssetIds, usedAssetIds, collapsed, onCollapsedChange, selectedAssetId, onPreview, onAdd }: {
  assets: VentureAsset[]
  productionAssetIds: number[]
  usedAssetIds: number[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  selectedAssetId?: number
  onPreview: (asset: VentureAsset) => void
  onAdd: (asset: VentureAsset) => Promise<void> | void
}) {
  const [query, setQuery] = useState("")
  const [media, setMedia] = useState<MediaFilter>("all")
  const [scope, setScope] = useState<ScopeFilter>("production")
  const [pendingId, setPendingId] = useState<number | null>(null)
  const productionIds = useMemo(() => new Set(productionAssetIds), [productionAssetIds])
  const usedIds = useMemo(() => new Set(usedAssetIds), [usedAssetIds])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assets.filter((asset) => {
      if (!asset.media_type) return false
      if (media !== "all" && asset.media_type !== media) return false
      if (scope === "production" && !productionIds.has(asset.id) && !usedIds.has(asset.id)) return false
      if (scope === "venture" && asset.scope === "studio") return false
      if (scope === "studio" && asset.scope !== "studio") return false
      if (normalized && !assetLabel(asset).toLowerCase().includes(normalized) && !asset.tags?.some((tag) => tag.toLowerCase().includes(normalized))) return false
      return true
    }).sort((left, right) => new Date(right.created_at || right.updated_at || 0).getTime() - new Date(left.created_at || left.updated_at || 0).getTime())
  }, [assets, media, productionIds, query, scope, usedIds])

  if (collapsed) return <aside className="timeline-media-browser is-collapsed" aria-label="Media Browser">
    <OperatorIconButton label="Show Media Browser" detail="Browse Production, Venture and Studio media without leaving the Timeline." onClick={() => onCollapsedChange(false)}><PanelLeftOpen /></OperatorIconButton>
  </aside>

  return <aside className="timeline-media-browser" aria-label="Media Browser">
    <header><span><Library /><b>Media</b></span><OperatorIconButton label="Hide Media Browser" onClick={() => onCollapsedChange(true)}><PanelLeftClose /></OperatorIconButton></header>
    <div className="timeline-media-scope" aria-label="Media scope">
      {(["production", "venture", "studio"] as ScopeFilter[]).map((value) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === "production" ? "Production" : value === "venture" ? "Venture" : "Studio"}</button>)}
    </div>
    <label className="timeline-media-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" /></label>
    <div className="timeline-media-types" aria-label="Media type">
      {(["all", "image", "video", "audio"] as MediaFilter[]).map((value) => <button key={value} aria-pressed={media === value} onClick={() => setMedia(value)}>{value === "all" ? "All" : value}</button>)}
    </div>
    <div className="timeline-media-results">
      {visible.map((asset) => {
        const name = assetLabel(asset)
        const origin = assetOrigin(asset)
        const selected = asset.id === selectedAssetId
        return <article key={asset.id} className={cn("timeline-media-card", selected && "is-selected")} data-media-type={asset.media_type}>
          <button className="timeline-media-card-preview" aria-label={`Preview ${name}`} onClick={() => onPreview(asset)}>
            {asset.media_type === "image" ? <img src={visualAssetUrl(asset)} alt="" loading="lazy" decoding="async" />
              : asset.media_type === "video" ? <video src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} muted preload="metadata" playsInline />
                : <span className="timeline-media-audio-art"><SoundMediaIcon kind={String(asset.category || "audio").toLowerCase() === "sfx" ? "sfx" : String(asset.category || "").toLowerCase() === "music" ? "music" : "audio"} /></span>}
            <span className="timeline-media-kind">{asset.media_type === "image" ? <ImageIcon /> : asset.media_type === "video" ? <Film /> : <Waves />}</span>
            <span className={cn("timeline-media-origin", origin === "generated" && "is-generated")}>{origin === "generated" ? <Sparkles /> : origin === "freesound" ? <CloudDownload /> : <Upload />}</span>
            {usedIds.has(asset.id) && <span className="timeline-media-used"><CheckCircle2 /></span>}
          </button>
          <footer><button className="timeline-media-name" title={name} onClick={() => onPreview(asset)}>{name}</button><OperatorIconButton label={`Add ${name} at playhead`} busy={pendingId === asset.id} busyLabel={`Adding ${name}…`} onClick={async () => { setPendingId(asset.id); try { await onAdd(asset) } finally { setPendingId(null) } }}><Plus /></OperatorIconButton></footer>
        </article>
      })}
      {!visible.length && <div className="timeline-media-empty"><Library /><b>No matching media</b><small>Change the scope, type or search.</small></div>}
    </div>
  </aside>
})

function sourceForAsset(asset: VentureAsset): PlayerSource | null {
  if (asset.media_type !== "audio" || !asset.filename) return null
  return { key: `workstation-asset:${asset.id}`, url: audioUrl(asset.filename), title: assetLabel(asset), subtitle: asset.category || "Audio source", sourceLabel: "Source preview", kind: "asset" }
}

function AudioFocusMonitor({ selection, previewAsset, soundSession, onClosePreview }: { selection: WorkstationSelection; previewAsset: VentureAsset | null; soundSession: SoundSceneSession; onClosePreview: () => void }) {
  const player = useGlobalPlayer()
  const source = previewAsset ? sourceForAsset(previewAsset) : null
  const selectedClip = selection?.kind === "audio-placement" ? selection.primary.clip : null
  const selectedSpan = selection?.kind === "script-part" ? selection.span : null
  const url = source?.url || (selectedClip ? soundClipSourceUrl(selectedClip) : selectedSpan?.filename ? audioUrl(selectedSpan.filename) : "")
  const name = source?.title || selectedClip?.asset_name || selectedSpan?.role || selectedSpan?.voice_name || selectedSpan?.title || "Audio"
  const durationMs = previewAsset?.duration_ms || selectedClip?.resolved_duration_ms || selectedClip?.duration_ms || selectedSpan?.duration_ms || 0
  const isSourcePlaying = Boolean(source && player.source?.key === source.key && player.state === "playing")
  const kind = selectedClip ? soundClipMediaKind(selectedClip) : selectedSpan ? "speech" : "audio"
  return <section className="timeline-audio-monitor" aria-label="Audio Monitor">
    <header><span><Waves /><b>{previewAsset ? "Source" : "Audio"}</b></span>{previewAsset && <OperatorIconButton label="Close Source preview" onClick={() => { player.close(); onClosePreview() }}><X /></OperatorIconButton>}</header>
    <div className="timeline-audio-focus">
      <span className={cn("timeline-audio-focus-icon", `is-${kind}`)}><SoundMediaIcon kind={kind} /></span>
      <div><small>{previewAsset ? "SOURCE" : selection?.kind === "script-part" ? "SCRIPT PART" : "TIMELINE PLACEMENT"}</small><h3>{name}</h3><span>{formatDuration(durationMs / 1_000)}</span></div>
      {source && <OperatorIconButton className="timeline-audio-preview-play" label={isSourcePlaying ? `Pause ${name}` : `Preview ${name}`} onClick={() => { soundSession.pause(); void player.toggleSource(source) }}>{isSourcePlaying ? <Pause /> : <Play />}</OperatorIconButton>}
    </div>
    <div className="timeline-audio-waveform"><AudioWaveform url={url || undefined} bars={128} /></div>
    <footer>{source && player.source?.key === source.key ? <div className="timeline-source-audition"><span>{formatDuration(player.currentTime)}</span><Slider value={[player.currentTime]} max={Math.max(player.duration, 1)} step={.05} onValueChange={([value = 0]) => player.seek(value)} aria-label="Source preview position" /><span>{formatDuration(player.duration)}</span></div> : previewAsset ? "Source audition · Timeline playback remains separate" : "The main transport follows the Production Timeline"}</footer>
  </section>
}

function SourceVisualMonitor({ asset, soundSession, onClose }: { asset: VentureAsset; soundSession: SoundSceneSession; onClose: () => void }) {
  const player = useGlobalPlayer()
  const name = visualAssetName(asset)
  return <section className="timeline-source-monitor" aria-label="Source Monitor">
    <header><span><Film /><b>Source</b></span><OperatorIconButton label="Return to Program Monitor" onClick={onClose}><X /></OperatorIconButton></header>
    <div>{asset.media_type === "video" ? <video src={visualAssetPlaybackUrl(asset)} poster={visualAssetPosterUrl(asset)} controls playsInline onPlay={() => { soundSession.pause(); player.pause() }} /> : <img src={visualAssetUrl(asset)} alt={name} />}</div>
    <footer><small>{asset.media_type === "video" ? "VIDEO SOURCE" : "IMAGE SOURCE"}</small><b title={name}>{name}</b></footer>
  </section>
}

export function TimelineWorkbench({ selection, previewAsset, assets, productionAssetIds, usedAssetIds, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, browserCollapsed, onBrowserCollapsedChange, inspector, inspectorTitle, onCloseInspector, onPreviewAsset, onClosePreview, onAddAsset }: {
  selection: WorkstationSelection
  previewAsset: VentureAsset | null
  assets: VentureAsset[]
  productionAssetIds: number[]
  usedAssetIds: number[]
  document: VisualSceneDocument
  hasVisualPlacements: boolean
  playheadMs: number
  playback: "idle" | "preparing" | "playing"
  visualSession?: VisualSceneSession
  soundSession: SoundSceneSession
  visualSaving: boolean
  browserCollapsed: boolean
  onBrowserCollapsedChange: (collapsed: boolean) => void
  inspector?: ReactNode
  inspectorTitle?: string
  onCloseInspector?: () => void
  onPreviewAsset: (asset: VentureAsset) => void
  onClosePreview: () => void
  onAddAsset: (asset: VentureAsset) => Promise<void> | void
}) {
  const visualSelection = selection?.kind === "visual-placement" ? selection.primary.ref : null
  const visualSource = previewAsset && (previewAsset.media_type === "image" || previewAsset.media_type === "video") ? previewAsset : null
  const audioFocus = previewAsset?.media_type === "audio" || selection?.kind === "audio-placement" || selection?.kind === "script-part"
  return <div className={cn("timeline-workbench", browserCollapsed && "browser-collapsed", !inspector && "inspector-closed")}>
    <TimelineMediaBrowser assets={assets} productionAssetIds={productionAssetIds} usedAssetIds={usedAssetIds} collapsed={browserCollapsed} onCollapsedChange={onBrowserCollapsedChange} selectedAssetId={previewAsset?.id} onPreview={onPreviewAsset} onAdd={onAddAsset} />
    <section className="timeline-monitor" aria-label="Adaptive Monitor">
      {visualSource ? <SourceVisualMonitor asset={visualSource} soundSession={soundSession} onClose={onClosePreview} />
        : audioFocus ? <AudioFocusMonitor selection={selection} previewAsset={previewAsset} soundSession={soundSession} onClosePreview={onClosePreview} />
          : visualSession && hasVisualPlacements ? <TimelineViewer document={document} assets={assets} playheadMs={playheadMs} playback={playback} selection={visualSelection} session={visualSession} saving={visualSaving} />
            : <div className="timeline-monitor-empty"><Waves /><b>Select media or a Timeline placement</b><small>The Monitor adapts to image, video and audio.</small></div>}
    </section>
    {inspector && <aside className="timeline-workbench-inspector" aria-label="Contextual inspector"><header><h2>{inspectorTitle || "Inspector"}</h2>{onCloseInspector && <OperatorIconButton label="Close Inspector" onClick={onCloseInspector}><X /></OperatorIconButton>}</header><div>{inspector}</div></aside>}
  </div>
}
