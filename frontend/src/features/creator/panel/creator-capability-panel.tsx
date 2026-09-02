import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

import "./creator-capability-panel.css"

export function CreatorCapabilityPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("creator-capability-panel", className)} {...props} />
}

export function CreatorCapabilityBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("creator-capability-body", className)} {...props} />
}

export function CreatorCapabilityRoute({ className, "aria-label": ariaLabel, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("creator-capability-route", className)} aria-label={ariaLabel || "Creation route"} {...props} />
}

export function CreatorCapabilityFooter({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn("creator-capability-footer", className)} {...props} />
}
