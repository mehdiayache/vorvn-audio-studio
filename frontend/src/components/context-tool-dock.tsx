import { AudioLines, Command as CommandIcon, FileAudio, Folder, ListTree, Mic2, Plus, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react"
import { useMemo, useState } from "react"

import { ProductionExplorer } from "@/components/project-explorer"
import { VoiceIdentity } from "@/components/voice-identity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { clipText } from "@/lib/format"
import { cn } from "@/lib/utils"
import { resolveVoice } from "@/lib/voice"
import type { HierarchyNode, ProductionPart, VoiceDirectory } from "@/types/domain"

export type ContextPanel = "explorer" | "structure" | "voices" | "assets" | "search" | "issues" | "commands" | null

const toolMeta = [
  { key: "explorer", label: "Production Explorer", description: "Navigate Ventures, Projects, Productions, and reusable assets.", icon: Folder },
  { key: "structure", label: "Script structure", description: "Locate real source objects in the ordered Production sequence.", icon: ListTree },
  { key: "voices", label: "Voices", description: "Inspect the voices currently used across this Production.", icon: Mic2 },
  { key: "assets", label: "Venture assets", description: "Open reusable music, intros, outros, and stingers.", icon: FileAudio },
  { key: "search", label: "Search Production", description: "Find words, voices, states, and linked audio.", icon: Search },
  { key: "issues", label: "Production checks", description: "Find drafts, missing sources, and stale captions in this Production.", icon: TriangleAlert },
  { key: "commands", label: "Command menu", description: "Run supported Production actions from one searchable list.", icon: CommandIcon },
] as const

function PanelHeader({ title, description, onClose }: { title: string; description: string; onClose: () => void }) {
  return <header className="context-panel-head"><div><b>{title}</b><p>{description}</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close contextual panel"><X /></Button></header>
}

export function ContextToolDock({ panel, onPanel, nodes, activeKey, parts, directory, productionPlaying, onLocate, onOpenTool, onPreview, onRelease }: {
  panel: ContextPanel
  onPanel: (panel: ContextPanel) => void
  nodes: HierarchyNode[]
  activeKey: string
  parts: ProductionPart[]
  directory: VoiceDirectory
  productionPlaying: boolean
  onLocate: (id: number) => void
  onOpenTool: (tool: "speech" | "asset" | "silence" | "music") => void
  onPreview: () => void
  onRelease: () => void
}) {
  const [query, setQuery] = useState("")
  const [commandQuery, setCommandQuery] = useState("")
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const voiceParts = sourceParts.filter((part) => ["audio", "speech", "draft"].includes(part.kind))
  const voices = useMemo(() => [...new Map(voiceParts.map((part) => [part.voice_identity_id || part.voice, part])).values()], [voiceParts])
  const issues = sourceParts.filter((part) => part.kind === "draft" || part.missing || part.subtitles_stale)
  const results = sourceParts.filter((part) => `${part.text || ""} ${part.title || ""} ${part.voice || ""} ${part.kind}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  function act(action: () => void) { onPanel(null); action() }
  function voiceFor(part: ProductionPart) { return resolveVoice(part.voice, directory, part.voice_identity_id) }

  function panelBody(key: Exclude<ContextPanel, null>) {
    if (key === "explorer") return <div className="context-explorer"><ProductionExplorer nodes={nodes} activeKey={activeKey} /></div>
    if (key === "structure") return <div className="context-list">{sourceParts.map((part, index) => <button key={part.id} onClick={() => act(() => onLocate(part.id))}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{part.kind === "silence" ? "Silence" : part.kind === "asset" ? part.title || "Venture audio" : voiceFor(part).name}</b><small>{part.kind === "silence" ? `${part.title || (part.duration_ms || 0) / 1000} seconds` : clipText(part.text || part.title || "Untitled", 72)}</small></div></button>)}</div>
    if (key === "voices") return <div className="context-list voice-context-list">{voices.length ? voices.map((part) => { const identityKey = part.voice_identity_id || part.voice || String(part.id); return <button key={identityKey} onClick={() => act(() => onOpenTool("speech"))}><VoiceIdentity voice={part.voice} identityId={part.voice_identity_id} directory={directory} compact /><small>{voiceParts.filter((candidate) => (candidate.voice_identity_id || candidate.voice) === identityKey).length} voice parts</small></button> }) : <p className="context-empty">No recorded voice in this Production.</p>}</div>
    if (key === "assets") return <div className="context-actions-list"><Button variant="ghost" onClick={() => act(() => onOpenTool("asset"))}><FileAudio /><span><b>Intros, Outros, Stingers</b><small>Browse sequential Venture audio.</small></span></Button><Button variant="ghost" onClick={() => act(() => onOpenTool("music"))}><AudioLines /><span><b>Music library</b><small>Choose the parallel background bed.</small></span></Button></div>
    if (key === "search") return <div className="context-search"><label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this Production" autoFocus /></label><div className="context-list">{query.trim() && results.map((part) => <button key={part.id} onClick={() => act(() => onLocate(part.id))}><span>{String(sourceParts.indexOf(part) + 1).padStart(2, "0")}</span><div><b>{part.kind === "silence" ? "Silence" : part.kind === "asset" ? part.title || "Venture audio" : voiceFor(part).name}</b><small>{clipText(part.text || part.title || "Untitled", 72)}</small></div></button>)}{query.trim() && !results.length && <p className="context-empty">No matching source.</p>}</div></div>
    if (key === "issues") return <div className="context-list">{issues.length ? issues.map((part) => <button key={part.id} onClick={() => act(() => onLocate(part.id))}><TriangleAlert /><div><b>{part.missing ? "Missing Venture asset" : part.kind === "draft" ? "Draft has no recording" : "Captions need refresh"}</b><small>{clipText(part.text || part.title || "Part", 72)}</small></div></button>) : <p className="context-empty">No drafts, missing sources, or stale captions.</p>}</div>
    const commands = [
      { label: "Add speech", detail: "Create", icon: Plus, action: () => onOpenTool("speech") },
      { label: "Add silence", detail: "Create", icon: Plus, action: () => onOpenTool("silence") },
      { label: "Add Venture audio", detail: "Create", icon: FileAudio, action: () => onOpenTool("asset") },
      { label: productionPlaying ? "Pause full production" : "Play full production", detail: "Voice, assets, silences, and music", icon: AudioLines, action: onPreview },
      { label: "Open Mix & Export", detail: "Production", icon: SlidersHorizontal, action: onRelease },
    ].filter((command) => command.label.toLocaleLowerCase().includes(commandQuery.trim().toLocaleLowerCase()))
    return <div className="context-search context-command"><label><Search /><Input value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Type a Production action…" autoFocus /></label><div className="context-list">{commands.map(({ label, detail, icon: Icon, action }) => <button key={label} onClick={() => act(action)}><Icon /><div><b>{label}</b><small>{detail}</small></div></button>)}{!commands.length && <p className="context-empty">No supported action found.</p>}</div></div>
  }

  return <aside className="context-tool-dock" aria-label="Production tools">
    {toolMeta.map(({ key, label, description, icon: Icon }, index) => <Popover key={key} open={panel === key} onOpenChange={(open) => onPanel(open ? key : null)}><Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button className={cn(index === 0 && "dock-leading")} variant="ghost" size="icon" aria-label={label}><Icon /></Button></PopoverTrigger></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip><PopoverContent className="context-popover" side="right" align="start" sideOffset={14}><PanelHeader title={label} description={description} onClose={() => onPanel(null)} />{panelBody(key)}</PopoverContent></Popover>)}
  </aside>
}
