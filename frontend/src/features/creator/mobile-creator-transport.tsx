import { useEffect } from "react"

import { useGlobalPlayer } from "@/components/global-player-provider"
import { TransportStrip } from "@/components/transport-strip"

/** Moves only the shared Transport presentation; Player ownership stays global. */
export function MobileCreatorTransport({ active }: { active: boolean }) {
  const player = useGlobalPlayer()
  useEffect(() => {
    if (!active) return
    return player.claimTransport("creator")
  }, [active, player.claimTransport])
  if (!active) return null
  return <div className="creator-mobile-transport"><TransportStrip host="creator" /></div>
}
