import { useEffect } from "react"

import { TransportStrip } from "@/components/transport-strip"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { SoundSceneTransport } from "@/features/sound-scene/sound-scene-transport"
import type { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"

export function ProjectFloatingTransport({ soundSession, previewStale, onRefreshPreview, onOpenCaptionContext }: { soundSession?: SoundSceneSession; previewStale?: boolean; onRefreshPreview?: () => void; onOpenCaptionContext?: (partId: number) => void }) {
  const player = useGlobalPlayer()
  useEffect(() => player.claimTransport("project"), [player.claimTransport])
  const sourceAuditionActive = Boolean(soundSession && player.source && player.source.kind !== "project" && (player.state === "playing" || player.state === "loading"))
  return <div className="project-transport-host">{soundSession && !sourceAuditionActive
    ? <SoundSceneTransport session={soundSession} />
    : <TransportStrip host="project" previewStale={previewStale} onRefreshPreview={onRefreshPreview} onOpenCaptionContext={onOpenCaptionContext} />}</div>
}
