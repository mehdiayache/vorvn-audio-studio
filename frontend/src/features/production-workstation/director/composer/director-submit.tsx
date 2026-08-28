import { ArrowUp, LoaderCircle } from "lucide-react"

import { OperatorTooltip } from "@/components/operator-tooltip"
import { InputGroupButton } from "@/components/ui/input-group"

export function DirectorSubmit({ disabled, busy, reason, onClick }: { disabled: boolean; busy: boolean; reason?: string; onClick: () => void }) {
  const label = busy ? "Starting generation" : "Create"
  return <OperatorTooltip label={label} detail={reason} disabledTrigger={disabled || busy}>
    <InputGroupButton type="button" variant="default" size="icon-sm" className="director-submit" aria-label={label} disabled={disabled || busy} onClick={onClick}>
      {busy ? <LoaderCircle className="spin" /> : <ArrowUp />}
    </InputGroupButton>
  </OperatorTooltip>
}
