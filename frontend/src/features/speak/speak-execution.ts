import type { GeneratePayload, RecordingAttempt, RecordingSession } from "@/types/domain"

export type SpeakExecution = { jobId: string; sessionId: string; payload: GeneratePayload }

export function belongsToRecordingSession(executionSessionId: string, activeSessionId: string) {
  return executionSessionId === activeSessionId
}

export function recoverSpeakExecutions(current: SpeakExecution[], session: RecordingSession) {
  const active = new Set(["queued", "running", "retrying"])
  const known = new Set(current.map((item) => item.jobId))
  const recovered = session.attempts
    .filter((attempt) => active.has(attempt.status) && !known.has(attempt.id))
    .map((attempt) => ({ jobId: attempt.id, sessionId: session.id, payload: attempt.request }))
  return recovered.length ? [...current, ...recovered] : current
}

export function recordingAttemptStatus(attempt: Pick<RecordingAttempt, "status">) {
  if (attempt.status === "blocked") return "review" as const
  if (["failed", "lost", "cancelled"].includes(attempt.status)) return "failed" as const
  if (attempt.status === "warning") return "warning" as const
  if (["queued", "running", "retrying"].includes(attempt.status)) return "pending" as const
  return "ready" as const
}
