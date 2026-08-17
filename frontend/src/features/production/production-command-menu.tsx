import { AudioLines, FileAudio, FileJson2, Mic2, Search, SlidersHorizontal, Timer } from "lucide-react"

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { clipText, formatAuthoredRole } from "@/lib/format"
import type { ProductionPart } from "@/types/domain"

export function ProductionCommandMenu({ open, parts, productionPlaying, onOpenChange, onAddSpeech, onAddSilence, onAddAsset, onImport, onPreview, onRelease, onLocate }: {
  open: boolean
  parts: ProductionPart[]
  productionPlaying: boolean
  onOpenChange: (open: boolean) => void
  onAddSpeech: () => void
  onAddSilence: () => void
  onAddAsset: () => void
  onImport: () => void
  onPreview: () => void
  onRelease: () => void
  onLocate: (id: number) => void
}) {
  const run = (action: () => void) => { onOpenChange(false); action() }
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Production commands" description="Add content, navigate Parts and run Production actions.">
    <CommandInput placeholder="Search commands or Parts…" />
    <CommandList><CommandEmpty>No matching command or Part.</CommandEmpty>
      <CommandGroup heading="Create"><CommandItem onSelect={() => run(onAddSpeech)}><Mic2 /> Add Speech</CommandItem><CommandItem onSelect={() => run(onAddSilence)}><Timer /> Add Silence</CommandItem><CommandItem onSelect={() => run(onAddAsset)}><FileAudio /> Add Venture Audio</CommandItem><CommandItem onSelect={() => run(onImport)}><FileJson2 /> Import JSON</CommandItem></CommandGroup>
      <CommandGroup heading="Production"><CommandItem onSelect={() => run(onPreview)}><AudioLines /> {productionPlaying ? "Pause Production" : "Play Production"}</CommandItem><CommandItem onSelect={() => run(onRelease)}><SlidersHorizontal /> Mix & Export</CommandItem></CommandGroup>
      <CommandGroup heading="Find a Part">{parts.filter((part) => part.kind !== "stitch").map((part, index) => {
        const role = formatAuthoredRole(part.authored_role)
        const voice = part.voice_name || part.voice || ""
        const searchable = [role, voice, part.capability_name, part.engine, part.language, part.text, part.title, part.kind].filter(Boolean).join(" ")
        return <CommandItem key={part.id} value={`part ${index + 1} ${searchable}`} onSelect={() => run(() => onLocate(part.id))}><Search /><span><b>{role || voice || `Part ${index + 1}`}</b> · {clipText([role || voice ? `Part ${index + 1}` : "", part.text || part.title || part.kind].filter(Boolean).join(" · "), 72)}</span></CommandItem>
      })}</CommandGroup>
    </CommandList>
  </CommandDialog>
}
