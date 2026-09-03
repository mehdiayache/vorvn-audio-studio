import { ChevronDown } from "lucide-react"
import { useState } from "react"
import type { DetailsHTMLAttributes, HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

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

export function CreatorCapabilityField({ label, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { label: ReactNode }) {
  return <div className={cn("creator-capability-field", className)} {...props}>
    <span className="creator-capability-field-label">{label}</span>
    {children}
  </div>
}

export function CreatorCapabilityGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("creator-capability-grid", className)} {...props} />
}

export function CreatorCapabilityFooter({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <footer className={cn("creator-capability-footer", className)} {...props} />
}

export function CreatorActionBar({ status, actions, error, className }: {
  status?: ReactNode
  actions: ReactNode
  error?: ReactNode
  className?: string
}) {
  return <CreatorCapabilityFooter className={cn("creator-action-bar", className)}>
    <div className="creator-action-status" role="status" aria-live="polite">{status}</div>
    {error && <div className="creator-action-error" role="alert">{error}</div>}
    <div className="creator-action-controls">{actions}</div>
  </CreatorCapabilityFooter>
}

export function CreatorModeSwitch<T extends string>({ value, options, onChange, label = "Creation mode", className }: {
  value: T
  options: ReadonlyArray<{ value: T; label: string; detail?: string }>
  onChange: (value: T) => void
  label?: string
  className?: string
}) {
  return <ToggleGroup type="single" variant="outline" value={value} onValueChange={(next) => next && onChange(next as T)} aria-label={label} className={cn("creator-mode-switch", className)}>
    {options.map((option) => <ToggleGroupItem key={option.value} value={option.value} aria-label={option.detail ? `${option.label}: ${option.detail}` : option.label}>{option.label}</ToggleGroupItem>)}
  </ToggleGroup>
}

export function CreatorPromptField({ label = "Prompt", ariaLabel, value, placeholder, disabled, rows = 4, onChange, onSubmit, className }: {
  label?: string
  ariaLabel: string
  value: string
  placeholder: string
  disabled?: boolean
  rows?: number
  onChange: (value: string) => void
  onSubmit?: () => void
  className?: string
}) {
  return <CreatorCapabilityField label={label} className={cn("creator-prompt-field", className)}>
    <Textarea aria-label={ariaLabel} value={value} placeholder={placeholder} disabled={disabled} rows={rows} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
      if (onSubmit && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onSubmit()
      }
    }} />
  </CreatorCapabilityField>
}

export function CreatorDisclosure({ title, detail, children, className, initiallyOpen = false, ...props }: DetailsHTMLAttributes<HTMLDetailsElement> & {
  title: string
  detail?: ReactNode
  children: ReactNode
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  return <details className={cn("creator-disclosure", className)} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} {...props}>
    <summary><span><b>{title}</b>{detail && <small>{detail}</small>}</span><ChevronDown aria-hidden="true" /></summary>
    <div className="creator-disclosure-content">{children}</div>
  </details>
}
