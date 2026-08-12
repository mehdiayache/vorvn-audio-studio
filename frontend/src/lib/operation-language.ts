/** Human summary for operator surfaces. Raw diagnostics remain available in Details. */
export function operatorErrorMessage(value?: string | null) {
  const message = String(value || "").trim()
  if (!message) return "This operation did not finish. Open Details for its technical record."
  const lower = message.toLowerCase()
  if (/foreignkey|notnull|uniqueviolation|psycopg|postgres|relation ["']/.test(lower)) return "Audio Studio could not save this operation. Its technical record is available in Details."
  if (lower.includes("voice") && (lower.includes("not exist") || lower.includes("no longer exists") || lower.includes("unsupported"))) return "The selected provider voice is no longer available for this exact route."
  if (lower.includes("no audio") || lower.includes("incomplete speech")) return "The provider did not return a complete usable recording."
  if (lower.includes("api key") || lower.includes("unauthorized")) return "The provider rejected the configured credentials. Check Provider settings."
  if (lower.includes("quota") || lower.includes("arrearage") || lower.includes("insufficient")) return "The provider refused this operation because of billing or quota."
  if (lower.includes("timeout") || lower.includes("timed out")) return "The provider response was interrupted. Review the operation before retrying."
  const firstLine = message.split(/\r?\n/, 1)[0] || message
  return firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine
}

export function operationStatusLabel(status: string, result?: { requires_review?: boolean; ambiguous?: boolean; needs_confirmation?: boolean } | null) {
  if (status === "blocked" && (result?.requires_review || result?.ambiguous)) return "Review required"
  if (status === "blocked" && result?.needs_confirmation) return "Confirmation required"
  return ({ queued: "Queued", running: "Running", retrying: "Retrying", ok: "Completed", warning: "Completed with warnings", failed: "Failed", lost: "Interrupted", cancelled: "Cancelled", blocked: "Blocked" } as Record<string, string>)[status] || status
}
