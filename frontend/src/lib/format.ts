export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`
}

export function formatExactDurationMs(milliseconds: number) {
  const seconds = Math.max(0, Number(milliseconds || 0) / 1000)
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(seconds)} ${seconds === 1 ? "second" : "seconds"}`
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: value < 0.01 ? 4 : 2 }).format(value || 0)
}

export function formatMicroMoney(value: number) {
  const amount = Number(value || 0)
  return `$${amount.toFixed(amount > 0 && amount < 0.0001 ? 6 : 4)}`
}

export function formatUpdated(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return "Updated today"
  if (days === 1) return "Updated yesterday"
  if (days < 7) return `Updated ${days} days ago`
  return `Updated ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}`
}

export function clipText(text: string, length = 150) {
  const clean = (text || "").replace(/\s+/g, " ").trim()
  return clean.length > length ? `${clean.slice(0, length).trimEnd()}…` : clean
}

export function formatPartNumber(index: number) {
  return String(Math.max(0, index) + 1).padStart(2, "0")
}

export function formatPartLabel(index: number) {
  return `Part ${formatPartNumber(index)}`
}

export function formatAuthoredRole(role?: string | null) {
  const value = String(role || "").trim().replace(/[-_]+/g, " ")
  return value ? value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase()) : ""
}

export function formatPartRoleLabel(index: number, role?: string | null) {
  const label = formatAuthoredRole(role)
  return label ? `${formatPartNumber(index)} · ${label}` : formatPartLabel(index)
}

export function textDirection(text?: string): "rtl" | "ltr" {
  return /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/.test(text || "") ? "rtl" : "ltr"
}

export function partDurationMs(part: { kind: string; duration_ms?: number | null; title?: string | null }) {
  if (part.kind === "silence") return Math.max(0, Number(part.title || 0) * 1000)
  return Math.max(0, Number(part.duration_ms || 0))
}
