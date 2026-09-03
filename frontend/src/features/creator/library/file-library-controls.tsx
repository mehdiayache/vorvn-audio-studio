import { X } from "lucide-react"
import { type KeyboardEvent, useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AudioFileCategory } from "@/types/domain"

export const FILE_CATEGORIES = [
  ["music", "Music"], ["sfx", "Sound Effect"], ["ambience", "Ambience"],
] as const satisfies readonly (readonly [AudioFileCategory, string])[]

export const CATEGORY_LABELS: Record<AudioFileCategory, string> = {
  music: "Music", sfx: "Sound Effect", ambience: "Ambience",
}

export function FileCategorySelect({ value, onChange }: {
  value: AudioFileCategory | null
  onChange: (value: AudioFileCategory | null) => void
}) {
  return <label className="file-field"><span>Category <small>Optional</small></span><Select value={value || "unclassified"} onValueChange={(next) => onChange(next === "unclassified" ? null : next as AudioFileCategory)}>
    <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="unclassified">No category</SelectItem>{FILE_CATEGORIES.map(([category, label]) => <SelectItem key={category} value={category}>{label}</SelectItem>)}</SelectContent>
  </Select></label>
}

export function FileTagEditor({ tags, onChange, onError, placeholder = "Add a tag" }: {
  tags: string[]
  onChange: (tags: string[]) => void
  onError: (message: string) => void
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const add = (raw = text) => {
    const next = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    if (!next) return
    if (next.length > 32) { onError("Keep each tag under 32 characters."); return }
    if (tags.includes(next)) { setText(""); return }
    if (tags.length >= 12) { onError("Use at most 12 tags."); return }
    onChange([...tags, next]); setText(""); onError("")
  }
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add() }
    if (event.key === "Backspace" && !text && tags.length) onChange(tags.slice(0, -1))
  }
  return <label className="file-field"><span>Tags <small>Optional</small></span><div className="file-tag-entry">
    {tags.map((tag) => <button key={tag} type="button" onClick={() => onChange(tags.filter((item) => item !== tag))}>{tag}<X /></button>)}
    <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={keyDown} onBlur={() => add()} placeholder={placeholder} />
  </div></label>
}
