import { useMemo, useState, type ComponentProps, type RefObject } from "react"

import { SoundSceneWorkspace } from "@/features/sound-scene/timeline/sound-scene-workspace"
import { DirectorLibraryDialog } from "../director/director-library-dialog"
import { DirectorPreviewDialog } from "../director/director-preview-dialog"
import type { VentureAsset } from "@/types/domain"

type TimelineStageProps = ComponentProps<typeof SoundSceneWorkspace> & {
  centerPaneRef: RefObject<HTMLElement | null>
  directorAssetIds: number[]
}

export function TimelineStage({ centerPaneRef, directorAssetIds, ...workspaceProps }: TimelineStageProps) {
  const [targetTrackId, setTargetTrackId] = useState<string | null | undefined>(undefined)
  const [previewAsset, setPreviewAsset] = useState<VentureAsset | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const visual = workspaceProps.visual
  const directorImages = useMemo(() => {
    const ids = new Set(directorAssetIds)
    return (visual?.assets || []).filter((asset) => ids.has(asset.id) && asset.media_type === "image")
  }, [directorAssetIds, visual?.assets])
  const workspaceVisual = visual ? { ...visual, onAddImage: (trackId?: string) => setTargetTrackId(trackId || null) } : undefined
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <SoundSceneWorkspace {...workspaceProps} visual={workspaceVisual} />
    {visual && <DirectorLibraryDialog open={targetTrackId !== undefined} assets={directorImages} pendingId={pendingId} title="Add image to Timeline" description="Choose an image collected in Director. It will be placed at the current playhead." emptyDescription="Collect or upload an image in Director first." onOpenChange={(open) => { if (!open) setTargetTrackId(undefined) }} onPreview={setPreviewAsset} onAdd={(asset) => {
      setPendingId(asset.id)
      void visual.session.addImage(asset, workspaceProps.session.snapshot().playhead * 1000, targetTrackId || undefined).then(() => setTargetTrackId(undefined)).finally(() => setPendingId(null))
    }} />}
    <DirectorPreviewDialog asset={previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null) }} />
  </main>
}
