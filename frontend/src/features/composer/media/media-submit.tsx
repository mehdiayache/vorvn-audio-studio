import { Sparkles } from "lucide-react"

import { ActionButton } from "@/components/operator-action"

export function MediaSubmit({ disabled, busy, reason, onClick }: { disabled: boolean; busy: boolean; reason?: string; onClick: () => void }) {
  return <ActionButton
    type="button"
    className="media-submit"
    busy={busy}
    busyLabel="Starting generation…"
    disabled={disabled}
    aria-describedby={reason ? "media-composer-readiness" : undefined}
    onClick={onClick}
  ><Sparkles />Generate</ActionButton>
}
