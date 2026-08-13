import { useEffect } from "react"

import { TransportStrip } from "@/components/transport-strip"
import { useGlobalPlayer } from "@/components/global-player-provider"

export function ProductionFloatingTransport() {
  const player = useGlobalPlayer()
  useEffect(() => player.claimTransport("production"), [player.claimTransport])
  return <div className="production-transport-host"><TransportStrip host="production" /></div>
}
