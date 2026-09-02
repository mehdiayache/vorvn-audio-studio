import { Images, Mic2, Music2, Waves } from "lucide-react"

import { cn } from "@/lib/utils"

import "./creator-capability-picker.css"

export type CreatorCapabilityId = "media" | "speech" | "music" | "sfx"

const capabilities = [
  { id: "media", label: "Media", icon: Images },
  { id: "speech", label: "Speech", icon: Mic2 },
  { id: "music", label: "Music", icon: Music2 },
  { id: "sfx", label: "SFX", icon: Waves },
] as const

export function CreatorCapabilityPicker({ value, onChange, className }: {
  value: CreatorCapabilityId
  onChange: (value: CreatorCapabilityId) => void
  className?: string
}) {
  return <nav className={cn("creator-capability-picker", className)} aria-label="Creation capability">
    {capabilities.map(({ id, label, icon: Icon }) => <button
      type="button"
      key={id}
      aria-pressed={value === id}
      onClick={() => onChange(id)}
    ><Icon aria-hidden="true" /><span>{label}</span></button>)}
  </nav>
}
