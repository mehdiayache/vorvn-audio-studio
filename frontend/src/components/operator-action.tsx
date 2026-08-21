import type { ComponentProps, ReactNode } from "react"
import { LoaderCircle } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"

type ButtonProps = ComponentProps<typeof Button>

export function ActionButton({
  busy = false,
  busyLabel,
  children,
  disabled,
  ...props
}: ButtonProps & {
  busy?: boolean
  busyLabel: ReactNode
}) {
  return <Button {...props} disabled={disabled || busy} aria-busy={busy || undefined}>
    {busy ? <><LoaderCircle className="spin" />{busyLabel}</> : children}
  </Button>
}

export function OperatorIconButton({
  label,
  detail,
  side = "top",
  busy = false,
  busyLabel,
  children,
  disabled,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: Omit<ButtonProps, "aria-label"> & {
  label: string
  detail?: string
  side?: "top" | "right" | "bottom" | "left"
  busy?: boolean
  busyLabel?: string
}) {
  const accessibleLabel = busy ? busyLabel || label : label
  return <OperatorTooltip
    label={accessibleLabel}
    detail={detail}
    side={side}
    disabledTrigger={Boolean(disabled || busy)}
  >
    <Button
      {...props}
      variant={variant}
      size={size}
      disabled={disabled || busy}
      aria-label={accessibleLabel}
      aria-busy={busy || undefined}
    >
      {busy ? <LoaderCircle className="spin" /> : children}
    </Button>
  </OperatorTooltip>
}
