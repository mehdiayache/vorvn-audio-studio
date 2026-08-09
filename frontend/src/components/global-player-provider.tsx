import { createContext, useContext } from "react"
import type { ReactNode } from "react"

import { usePlayer } from "@/hooks/use-player"

type PlayerController = ReturnType<typeof usePlayer>

const PlayerContext = createContext<PlayerController | null>(null)

export function GlobalPlayerProvider({ children }: { children: ReactNode }) {
  const player = usePlayer()
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>
}

export function useGlobalPlayer(): PlayerController {
  const player = useContext(PlayerContext)
  if (!player) throw new Error("useGlobalPlayer must be used inside GlobalPlayerProvider.")
  return player
}
