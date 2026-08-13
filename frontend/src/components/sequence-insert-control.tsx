import { Clock3, FileAudio, Mic2, Plus } from "lucide-react"

import type { InsertKind } from "@/components/sequence-actions"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function SequenceInsertControl({ at, beforePartId, last = false, onInsert }: {
  at: number
  beforePartId: string | null
  last?: boolean
  onInsert: (kind: InsertKind, beforePartId: string | null) => void
}) {
  return (
    <div className={`sequence-insert${last ? " last" : ""}`}>
      <span className="sequence-insert-line" aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="sequence-insert-trigger" size="sm" aria-label={`Add part at position ${at + 1}`}>
            <Plus /> <span>{last ? "Add another Part" : "Add part"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="sequence-insert-menu" align="start">
          <span className="sequence-menu-label">Position {at + 1}</span>
          <DropdownMenuItem onSelect={() => onInsert("speech", beforePartId)}><Mic2 /><span><b>Speech</b><small>Write or paste the words to record.</small></span></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onInsert("silence", beforePartId)}><Clock3 /><span><b>Silence</b><small>Add an exact timed pause.</small></span></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onInsert("asset", beforePartId)}><FileAudio /><span><b>Venture audio</b><small>Insert an Intro, Outro, or Stinger.</small></span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
