import { CheckCircle2, CloudDownload, Film, Image as ImageIcon, Library, PanelLeftClose, PanelLeftOpen, Plus, Search, Sparkles, Upload, Waves, X } from "lucide-react"
import { memo, useMemo, useState, type ReactNode } from "react"

import { OperatorIconButton } from "@/components/operator-action"
import { Input } from "@/components/ui/input"
import { SoundMediaIcon } from "@/features/sound-scene/audio-presentation"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { visualAssetName, visualAssetPlaybackUrl, visualAssetPosterUrl, visualAssetUrl } from "@/features/production-workstation/director/director-assets"
import type { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"
import { cn } from "@/lib/utils"
import type { VentureAsset, VisualSceneDocument } from "@/types/domain"
import { PreviewPane, type PreviewTarget } from "./timeline-preview"
import type { WorkstationSelection } from "./workstation-selection"
import { WorkstationPaneHeader } from "./workstation-pane-header"

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
    <WorkstationPaneHeader icon={<Library />} title="Media" actions={<OperatorIconButton label="Hide Media Browser" onClick={() => onCollapsedChange(true)}><PanelLeftClose /></OperatorIconButton>} />
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

export function TimelineWorkbench({ selection, previewTarget, assets, productionAssetIds, usedAssetIds, document, hasVisualPlacements, playheadMs, playback, visualSession, soundSession, visualSaving, timelineTransport, browserCollapsed, onBrowserCollapsedChange, inspector, inspectorTitle, onCloseInspector, onPreviewAsset, onReturnTimeline, onAddAsset }: {
  selection: WorkstationSelection
  previewTarget: PreviewTarget
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
  timelineTransport: ReactNode
  browserCollapsed: boolean
  onBrowserCollapsedChange: (collapsed: boolean) => void
  inspector?: ReactNode
  inspectorTitle?: string
  onCloseInspector?: () => void
  onPreviewAsset: (asset: VentureAsset) => void
  onReturnTimeline: () => void
  onAddAsset: (asset: VentureAsset) => Promise<void> | void
}) {
  const selectedAssetId = previewTarget.kind === "source" ? previewTarget.assetId : undefined
  return <div className={cn("timeline-workbench", browserCollapsed && "browser-collapsed", !inspector && "inspector-closed")}>
    <TimelineMediaBrowser assets={assets} productionAssetIds={productionAssetIds} usedAssetIds={usedAssetIds} collapsed={browserCollapsed} onCollapsedChange={onBrowserCollapsedChange} selectedAssetId={selectedAssetId} onPreview={onPreviewAsset} onAdd={onAddAsset} />
    <section className="timeline-monitor" aria-label="Preview">
      <PreviewPane target={previewTarget} selection={selection} assets={assets} document={document} hasVisualPlacements={hasVisualPlacements} playheadMs={playheadMs} playback={playback} visualSession={visualSession} soundSession={soundSession} visualSaving={visualSaving} timelineTransport={timelineTransport} onReturnTimeline={onReturnTimeline} />
    </section>
    {inspector && <aside className="timeline-workbench-inspector" aria-label="Contextual inspector"><WorkstationPaneHeader title={inspectorTitle || "Inspector"} heading actions={onCloseInspector ? <OperatorIconButton label="Close Inspector" onClick={onCloseInspector}><X /></OperatorIconButton> : undefined} /><div>{inspector}</div></aside>}
  </div>
}
