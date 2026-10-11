import { SOUND_SCENE_ZOOM_LEVELS } from "@/features/sound-scene/engine/sound-scene-engine"
import { useTimelineViewport as useStudioTimelineViewport } from "@/components/studio-timeline/use-timeline-viewport"
export function useTimelineViewport(options: Omit<Parameters<typeof useStudioTimelineViewport>[0], "zoomLevels">) {
  return useStudioTimelineViewport({ ...options, zoomLevels: SOUND_SCENE_ZOOM_LEVELS })
}
