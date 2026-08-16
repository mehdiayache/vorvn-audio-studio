import { useEffect, useState } from "react"
import { UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatAuthoredRole } from "@/lib/format"
import type { ComposerController } from "./composer-controller"

export function ComposerRoleEditor({ composer }: { composer: ComposerController }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(composer.authoredRole)

  useEffect(() => setValue(composer.authoredRole), [composer.authoredRole])
  if (!composer.part) return null

  async function save() {
    await composer.saveRole(value)
    setOpen(false)
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" className="composer-role-trigger"><UserRound />{formatAuthoredRole(composer.authoredRole) || "Add story role"}</Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="composer-role-popover">
      <form onSubmit={(event) => { event.preventDefault(); void save().catch(() => undefined) }}>
        <label htmlFor="composer-authored-role">Story role</label>
        <Input id="composer-authored-role" autoFocus maxLength={120} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Narrator, Esther, Mordecai…" />
        <small>Labels this speaker in the Production. It does not create a Cast.</small>
        <div><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" disabled={composer.roleBusy}>{composer.roleBusy ? "Saving…" : "Save role"}</Button></div>
      </form>
    </PopoverContent>
  </Popover>
}
