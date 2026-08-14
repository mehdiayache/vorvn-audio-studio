import { ChevronDown, ChevronUp, Copy, FileAudio, FolderOpen, MoreHorizontal, Pause, Play, Replace, Trash2, Volume2, VolumeX } from "lucide-react"

import type { SequenceActions } from "@/components/sequence-actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { audioUrl } from "@/lib/api"
import { formatDuration, partDurationMs } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ProductionPart } from "@/types/domain"

export function AssetPartCard({ part, index, count, playing, onReplace, actions }: {
  part: ProductionPart
  index: number
  count: number
  playing: boolean
  onReplace: () => void
  actions: SequenceActions
}) {
  const title = part.title || "Venture audio"
  const assetType = part.asset_collection || part.asset_kind || "Venture audio"
  const duration = partDurationMs(part) / 1000
  const enabled = part.enabled !== false
  return <article id={`part-${part.id}`} className={cn("sequence-card asset-part-card", !enabled && "is-disabled", playing && "playing", part.missing && "missing")}>
    <button className="sequence-card-open" onClick={() => actions.openPart(part)} aria-label={`Open details for ${title}`}>
      <div className="sequence-card-heading"><span className="sequence-asset-identity"><span className="sequence-asset-icon"><FileAudio /></span><span><b>{title}</b><small>{assetType}</small></span></span><span className="sequence-card-status"><b>{duration ? formatDuration(duration) : "Unknown duration"}</b>{!enabled && <small>Excluded from output</small>}</span></div>
      <p>{part.missing ? "The linked Venture source is unavailable." : "Reusable audio from this Venture library."}</p>
      <div className="sequence-card-meta"><span>{assetType} · Venture provenance</span><span>Free reuse</span></div>
    </button>
    <div className="sequence-card-actions">
      <Button variant={enabled ? "ghost" : "secondary"} size="icon" onClick={() => actions.setEnabled?.(part, !enabled)} aria-label={enabled ? `Exclude ${title} from output` : `Include ${title} in output`}>{enabled ? <Volume2 /> : <VolumeX />}</Button>
      {part.filename && <Button variant="outline" size="icon" onClick={() => actions.play({ key: `part:${part.id}`, url: audioUrl(part.filename!), title, subtitle: "Venture asset", kind: "asset" })} aria-label={playing ? `Pause ${title}` : `Play ${title}`}>{playing ? <Pause /> : <Play />}</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Asset actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onReplace}><FolderOpen /> Open source in Asset Explorer</DropdownMenuItem>
        <DropdownMenuItem onSelect={onReplace}><Replace /> Replace from library</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(part)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move(part, -1)}><ChevronUp /> Move earlier</DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move(part, 1)}><ChevronDown /> Move later</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.moveToPosition(part)}>Move to position…</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(part)}><Trash2 /> Delete asset part</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
  </article>
}
