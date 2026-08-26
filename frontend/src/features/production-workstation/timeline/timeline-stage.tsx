import type { ComponentProps, RefObject } from "react"

import { SoundSceneWorkspace } from "@/features/sound-scene/timeline/sound-scene-workspace"

type TimelineStageProps = ComponentProps<typeof SoundSceneWorkspace> & {
  centerPaneRef: RefObject<HTMLElement | null>
}

export function TimelineStage({ centerPaneRef, ...workspaceProps }: TimelineStageProps) {
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <SoundSceneWorkspace {...workspaceProps} />
  </main>
}
