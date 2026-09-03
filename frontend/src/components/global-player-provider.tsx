import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"

import { usePlayer } from "@/hooks/use-player"

export type TransportHost = "shell" | "creator" | "production" | "library"

export type GlobalPlayerValue = ReturnType<typeof usePlayer> & {
  transportHost: TransportHost
  claimTransport: (host: TransportHost) => () => void
}

const PlayerContext = createContext<GlobalPlayerValue | null>(null)

export function GlobalPlayerProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  const [transportHost, setTransportHost] = useState<TransportHost>("shell")
  const transportHostRef = useRef<TransportHost>("shell")
  const claimTransport = useCallback((host: TransportHost) => {
    const previous = transportHostRef.current
    transportHostRef.current = host
    setTransportHost(host)
    return () => {
      if (transportHostRef.current !== host) return
      transportHostRef.current = previous
      setTransportHost(previous)
    }
  }, [])
  return <PlayerContext.Provider value={{ ...player, transportHost, claimTransport }}>{children}</PlayerContext.Provider>
}

export function useGlobalPlayer(): GlobalPlayerValue {
  const player = useContext(PlayerContext)
  if (!player) throw new Error("useGlobalPlayer must be used inside GlobalPlayerProvider.")
  return player
}
