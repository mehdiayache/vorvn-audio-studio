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
  const directorVisuals = useMemo(() => {
    const ids = new Set(directorAssetIds)
    return (visual?.assets || []).filter((asset) => ids.has(asset.id)
      && (asset.media_type === "image" || asset.media_type === "video")
      && (!targetMediaType || asset.media_type === targetMediaType))
  }, [directorAssetIds, targetMediaType, visual?.assets])
  const workspaceVisual = visual ? { ...visual, onAddVisual: (trackId?: string) => setTargetTrackId(trackId || null) } : undefined
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <TimelineWorkspace {...workspaceProps} visual={workspaceVisual} />
    {visual && <DirectorLibraryDialog open={targetTrackId !== undefined} assets={directorVisuals} pendingId={pendingId} title={targetMediaType ? `Add ${targetMediaType} to Timeline` : "Add media to Timeline"} description={targetMediaType ? `Choose a ${targetMediaType} collected in Director. It will be placed on this ${targetMediaType === "video" ? "Video" : "Image"} track at the playhead.` : "Choose an image or video collected in Director. The matching track will be used or created at the playhead."} emptyDescription={`Collect or upload ${targetMediaType ? `a ${targetMediaType}` : "an image or video"} in Director first.`} addLabel={targetTrackId ? "Add to track" : "Add at playhead"} onOpenChange={(open) => { if (!open) setTargetTrackId(undefined) }} onPreview={setPreviewAsset} onAdd={(asset) => {
      setPendingId(asset.id)
      void visual.session.addVisual(asset, workspaceProps.session.snapshot().playhead * 1000, targetTrackId || undefined).then(() => setTargetTrackId(undefined)).finally(() => setPendingId(null))
    }} />}
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </main>
}
