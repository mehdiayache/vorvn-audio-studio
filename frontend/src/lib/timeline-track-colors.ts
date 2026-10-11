/** Timeline identities deliberately do not depend on the application accent. */
export const TIMELINE_TRACK_COLORS = {
  violet: 292, blue: 250, teal: 185, amber: 78, rose: 355, green: 145,
  orange: 48, cyan: 220, magenta: 325, lime: 115, indigo: 270, coral: 20,
} as const
export type TimelineTrackColor = keyof typeof TIMELINE_TRACK_COLORS
export const SCRIPT_TRACK_COLOR: TimelineTrackColor = "violet"
export function isTimelineTrackColor(value: unknown): value is TimelineTrackColor {
  return typeof value === "string" && Object.hasOwn(TIMELINE_TRACK_COLORS, value)
}
/** Older documents have a stable identity without an automatic document write. */
export function trackColor(id: string, explicit?: TimelineTrackColor): TimelineTrackColor {
  if (explicit && isTimelineTrackColor(explicit)) return explicit
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  const colors = Object.keys(TIMELINE_TRACK_COLORS) as TimelineTrackColor[]
  return colors[(hash >>> 0) % colors.length]!
}
export function trackColorStyle(id: string, explicit?: TimelineTrackColor): Record<string, string> {
  return {"--track-color": `oklch(.64 .16 ${TIMELINE_TRACK_COLORS[trackColor(id, explicit)]})`}
}
export function nextTrackColor(used: readonly TimelineTrackColor[]): TimelineTrackColor {
  const counts = new Map<TimelineTrackColor, number>()
  for (const color of used) counts.set(color, (counts.get(color) ?? 0) + 1)
  return (Object.keys(TIMELINE_TRACK_COLORS) as TimelineTrackColor[])
    .reduce((best, color) => (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best, "blue")
}
export function nextTrackName(label: string, existing: readonly string[]): string {
  const names = new Set(existing.map(name => name.trim().toLocaleLowerCase()))
  let number = 1
  while (names.has(`${label} ${number}`.toLocaleLowerCase())) number++
  return `${label} ${number}`
}
