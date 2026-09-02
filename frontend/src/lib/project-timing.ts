import { partDurationMs } from "@/lib/format"
import type { ProjectPart } from "@/types/domain"

export type ProjectTimingSpan = {
  part: ProjectPart
  number: number
  start: number
  duration: number
  lane: "narration" | "sfx"
}

export function buildProjectTiming(parts: ProjectPart[]) {
  const included = parts.filter((part) => part.kind !== "stitch" && part.enabled !== false)
  const spans: ProjectTimingSpan[] = []
  const untimed: ProjectPart[] = []
  let cursor = 0

  included.forEach((part, index) => {
    const duration = Math.max(0, partDurationMs(part) / 1000)
    if (!duration) {
      untimed.push(part)
      return
    }
    spans.push({
      part,
      number: Number(part.position ?? index) + 1,
      start: cursor,
      duration,
      lane: part.kind === "file" ? "sfx" : "narration",
    })
    cursor += duration
  })

  return {
    spans,
    total: cursor,
    untimed,
    narration: spans.filter((span) => span.lane === "narration" && span.part.kind !== "silence"),
    silences: spans.filter((span) => span.part.kind === "silence"),
    sfx: spans.filter((span) => span.lane === "sfx"),
  }
}
