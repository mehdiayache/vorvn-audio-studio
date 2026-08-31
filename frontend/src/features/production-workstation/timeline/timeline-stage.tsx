import { useMemo, useState, type ComponentProps, type RefObject } from "react"

import { TimelineWorkspace } from "./timeline-workspace"
import { DirectorLibraryDialog } from "../director/director-library-dialog"
import { DirectorPreviewDialog } from "../director/director-preview-dialog"
import type { VentureAsset } from "@/types/domain"

type TimelineStageProps = ComponentProps<typeof TimelineWorkspace> & {
  centerPaneRef: RefObject<HTMLElement | null>
  directorAssetIds: number[]
}

export function TimelineStage({ centerPaneRef, directorAssetIds, ...workspaceProps }: TimelineStageProps) {
  const [targetTrackId, setTargetTrackId] = useState<string | null | undefined>(undefined)
  const [previewAsset, setPreviewAsset] = useState<VentureAsset | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const visual = workspaceProps.visual
  const targetMediaType = targetTrackId
    ? visual?.session.snapshot().document.tracks.find((track) => track.id === targetTrackId)?.media_type
    : undefined
  const availableVisuals = useMemo(() => {
    return (visual?.assets || []).filter((asset) => (asset.media_type === "image" || asset.media_type === "video")
      && (!targetMediaType || asset.media_type === targetMediaType))
  }, [targetMediaType, visual?.assets])
  const usedVisualAssetIds = visual?.session.snapshot().document.tracks.flatMap((track) => track.clips.map((clip) => clip.asset_id)) || []
  const workspaceVisual = visual ? { ...visual, onAddVisual: (trackId?: string) => setTargetTrackId(trackId || null) } : undefined
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <TimelineWorkspace {...workspaceProps} visual={workspaceVisual} productionAssetIds={directorAssetIds} />
    {visual && <DirectorLibraryDialog open={targetTrackId !== undefined} assets={availableVisuals} productionAssetIds={directorAssetIds} usedAssetIds={usedVisualAssetIds} defaultSource="production" pendingId={pendingId} title={targetMediaType ? `Add ${targetMediaType} to Timeline` : "Add media to Timeline"} description={targetMediaType ? `Choose a ${targetMediaType} from this Production, Venture or Studio Assets. It will be placed on this ${targetMediaType === "video" ? "Video" : "Image"} track at the playhead.` : "Choose an image or video from this Production, Venture or Studio Assets. A matching track will be used or created at the playhead."} emptyDescription={`Upload ${targetMediaType ? `a ${targetMediaType}` : "an image or video"} in Director first.`} addLabel={targetTrackId ? "Add to track" : "Add at playhead"} onOpenChange={(open) => { if (!open) setTargetTrackId(undefined) }} onPreview={setPreviewAsset} onAdd={(asset) => {
      setPendingId(asset.id)
      void visual.session.addVisual(asset, workspaceProps.session.snapshot().playhead * 1000, targetTrackId || undefined).then(() => setTargetTrackId(undefined)).finally(() => setPendingId(null))
    }} />}
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </main>
}
