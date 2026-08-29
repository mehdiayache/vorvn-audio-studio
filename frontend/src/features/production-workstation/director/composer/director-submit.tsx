import { Sparkles } from "lucide-react"

import { ActionButton } from "@/components/operator-action"

export function DirectorSubmit({ disabled, busy, reason, onClick }: { disabled: boolean; busy: boolean; reason?: string; onClick: () => void }) {
  return <ActionButton
    type="button"
    className="director-submit"
    busy={busy}
    busyLabel="Starting generation…"
    disabled={disabled}
    aria-describedby={reason ? "director-composer-readiness" : undefined}
    onClick={onClick}
  ><Sparkles />Generate</ActionButton>
}
