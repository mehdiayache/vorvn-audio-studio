import { AudioLines, FileAudio, Mic2, Search, SlidersHorizontal, Timer, Users } from "lucide-react"

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { clipText } from "@/lib/format"
import type { ProductionCastRole, ProductionPart } from "@/types/domain"

export function ProductionCommandMenu({ open, parts, cast, productionPlaying, onOpenChange, onAddSpeech, onAddSilence, onAddAsset, onPreview, onCast, onRelease, onLocate }: {
  open: boolean
  parts: ProductionPart[]
  cast: ProductionCastRole[]
  productionPlaying: boolean
  onOpenChange: (open: boolean) => void
  onAddSpeech: () => void
  onAddSilence: () => void
  onAddAsset: () => void
  onPreview: () => void
  onCast: () => void
  onRelease: () => void
  onLocate: (id: number) => void
}) {
  const run = (action: () => void) => { onOpenChange(false); action() }
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Production commands" description="Add content, navigate Parts and run Production actions.">
    <CommandInput placeholder="Search commands or Parts…" />
    <CommandList><CommandEmpty>No matching command or Part.</CommandEmpty>
      <CommandGroup heading="Create"><CommandItem onSelect={() => run(onAddSpeech)}><Mic2 /> Add Speech</CommandItem><CommandItem onSelect={() => run(onAddSilence)}><Timer /> Add Silence</CommandItem><CommandItem onSelect={() => run(onAddAsset)}><FileAudio /> Add Venture Audio</CommandItem></CommandGroup>
      <CommandGroup heading="Production"><CommandItem onSelect={() => run(onPreview)}><AudioLines /> {productionPlaying ? "Pause Production" : "Play Production"}</CommandItem><CommandItem onSelect={() => run(onCast)}><Users /> Open Cast</CommandItem><CommandItem onSelect={() => run(onRelease)}><SlidersHorizontal /> Mix & Export</CommandItem></CommandGroup>
      <CommandGroup heading="Find a Part">{parts.filter((part) => part.kind !== "stitch").map((part, index) => {
        const role = cast.find((item) => item.id === part.cast_role_id)
        return <CommandItem key={part.id} value={`part ${index + 1} ${role?.name || part.cast_role_name || ""} ${part.voice_name || part.voice || ""} ${part.text || part.title || part.kind}`} onSelect={() => run(() => onLocate(part.id))}><Search /><span><b>Part {index + 1}</b> · {clipText(part.text || part.title || part.kind, 72)}</span></CommandItem>
      })}</CommandGroup>
    </CommandList>
  </CommandDialog>
}
