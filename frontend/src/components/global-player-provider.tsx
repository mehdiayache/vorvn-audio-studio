import { createContext, useCallback, useContext, useState } from "react"
import type { ReactNode } from "react"

import { usePlayer } from "@/hooks/use-player"

export type GlobalPlayerValue = ReturnType<typeof usePlayer> & {
  transportHost: "shell" | "composer"
  claimTransport: (host: "shell" | "composer") => () => void
}

const PlayerContext = createContext<GlobalPlayerValue | null>(null)

export function GlobalPlayerProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  const [transportHost, setTransportHost] = useState<"shell" | "composer">("shell")
  const claimTransport = useCallback((host: "shell" | "composer") => {
    setTransportHost(host)
    return () => setTransportHost((current) => current === host ? "shell" : current)
  }, [])
  return <PlayerContext.Provider value={{ ...player, transportHost, claimTransport }}>{children}</PlayerContext.Provider>
}

export function useGlobalPlayer(): GlobalPlayerValue {
  const player = useContext(PlayerContext)
  if (!player) throw new Error("useGlobalPlayer must be used inside GlobalPlayerProvider.")
  return player
}
