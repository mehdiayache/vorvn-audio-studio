import { Image, Mic2, Music2, Video, Waves } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CreatorCapabilityId } from "../creator-host"

import "./creator-capability-picker.css"

const capabilities = [
  { id: "image", label: "Image", icon: Image },
  { id: "video", label: "Video", icon: Video },
  { id: "speech", label: "Speech", icon: Mic2 },
  { id: "music", label: "Music", icon: Music2 },
  { id: "sfx", label: "SFX", icon: Waves },
] as const

export function CreatorCapabilityPicker({ value, capabilities: available, onChange, className }: {
  value: CreatorCapabilityId
  capabilities: readonly CreatorCapabilityId[]
  onChange: (value: CreatorCapabilityId) => void
  className?: string
}) {
  return <nav className={cn("creator-capability-picker", className)} aria-label="Creation capability">
    {capabilities.filter(({ id }) => available.includes(id)).map(({ id, label, icon: Icon }) => <button
      type="button"
      key={id}
      aria-pressed={value === id}
      onClick={() => onChange(id)}
    ><Icon aria-hidden="true" /><span>{label}</span></button>)}
  </nav>
}
