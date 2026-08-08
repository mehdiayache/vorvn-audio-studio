import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

export function isImageIdentity(value?: string | null) {
  return Boolean(value && /^(\/|data:image\/|https?:\/\/)/.test(value))
}

export function VentureMark({ identity, name, compact = false, className }: {
  identity?: string | null
  name: string
  compact?: boolean
  className?: string
}) {
  return <span className={cn("venture-mark", compact && "compact", className)} aria-hidden="true" data-venture-name={name}>
    {isImageIdentity(identity) ? <img src={identity || ""} alt="" /> : identity ? <span>{identity}</span> : <Sparkles />}
  </span>
}
