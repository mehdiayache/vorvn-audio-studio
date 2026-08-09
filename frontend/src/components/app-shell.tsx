import { AudioLines, Captions, CircleDollarSign, FolderKanban, Layers3, Mic2, Settings2, UsersRound } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { audioStudioBase } from "@/lib/links"

const tools = [
  { key: "speak", label: "Speak", icon: Mic2 },
  { key: "projects", label: "Ventures", icon: FolderKanban },
  { key: "batch", label: "Batch", icon: Layers3 },
  { key: "voices", label: "Voices", icon: UsersRound },
  { key: "activity", label: "Activity", icon: CircleDollarSign },
  { key: "subtitles", label: "Subtitles", icon: Captions },
]

type ProviderState = boolean | "unavailable" | undefined

export function AppShell({ children, providerConfigured }: { children: ReactNode; providerConfigured?: ProviderState }) {
  const activeTool = window.location.pathname.startsWith(`${audioStudioBase}/speak`) ? "speak" : window.location.pathname.startsWith(`${audioStudioBase}/batch`) ? "batch" : window.location.pathname.startsWith(`${audioStudioBase}/voices`) ? "voices" : window.location.pathname.startsWith(`${audioStudioBase}/activity`) ? "activity" : window.location.pathname.startsWith(`${audioStudioBase}/subtitles`) ? "subtitles" : window.location.pathname.startsWith(`${audioStudioBase}/settings`) ? "settings" : "projects"
  return (
    <div className="app-shell">
      <header className="global-header">
        <a className="brand" href={`${audioStudioBase}/`} aria-label="VORVN Audio Studio home">
          <span className="brand-mark"><AudioLines /></span>
          <span><b>VORVN Audio Studio</b><small>Audio production operating system</small></span>
        </a>
        <nav className="tool-nav" aria-label="Studio tools">
          {tools.map(({ key, label, icon: Icon }) => (
            <a key={key} href={key === "projects" ? `${audioStudioBase}/` : `${audioStudioBase}/${key}`} className={cn("tool-link", key === activeTool && "active")}>
              <Icon /><span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="global-actions">
          <span className={cn("connection", (providerConfigured === false || providerConfigured === "unavailable") && "needs-key")}><i /> {providerConfigured === undefined ? "Checking Alibaba" : providerConfigured === "unavailable" ? "Audio Studio unavailable" : providerConfigured ? "Alibaba configured" : "Alibaba key needed"}</span>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon" asChild><a className={cn(activeTool === "settings" && "active")} href={`${audioStudioBase}/settings`} aria-label="Settings"><Settings2 /></a></Button></TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>
      {children}
    </div>
  )
}
