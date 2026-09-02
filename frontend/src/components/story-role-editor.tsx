import { UserRound } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatAuthoredRole } from "@/lib/format"
import { cn } from "@/lib/utils"

import "./story-role-editor.css"

export function StoryRoleEditor({ value, busy = false, className, onSave }: {
  value?: string | null
  busy?: boolean
  className?: string
  onSave: (value: string) => Promise<void> | void
}) {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || "")
  const label = formatAuthoredRole(value)

  useEffect(() => setDraft(value || ""), [value])

  async function save() {
    await onSave(draft.trim().replace(/\s+/g, " "))
    setOpen(false)
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" className={cn("story-role-trigger", className)} aria-label={label || "Add story role"}><UserRound />{label || "Add story role"}</Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="story-role-popover">
      <form onSubmit={(event) => { event.preventDefault(); void save().catch(() => undefined) }}>
        <label htmlFor={inputId}>Story role</label>
        <Input id={inputId} autoFocus maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Narrator, Esther, Mordecai…" />
        <small>Labels the speaker in this Project. It never creates Cast logic.</small>
        <div><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save role"}</Button></div>
      </form>
    </PopoverContent>
  </Popover>
}
