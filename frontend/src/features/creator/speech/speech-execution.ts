import type { GeneratePayload, RecordingAttempt, RecordingHistory, ResolvedGeneratePayload } from "@/types/domain"

export type SpeechExecution = { jobId: string; payload: GeneratePayload }

export function reusableGeneratePayload(request: ResolvedGeneratePayload): GeneratePayload {
  const payload = { ...request }
  delete payload.voice
  delete payload.engine
  delete payload.model
  delete payload.model_id
  delete payload.provider
  delete payload.provider_region
  return payload
}

export function recoverSpeechExecutions(current: SpeechExecution[], history: RecordingHistory) {
  const active = new Set(["queued", "running", "retrying"])
  const known = new Set(current.map((item) => item.jobId))
  const recovered = history.recordings
    .filter((attempt) => active.has(attempt.status) && !known.has(attempt.id))
    .map((attempt) => ({ jobId: attempt.id, payload: attempt.request }))
  return recovered.length ? [...current, ...recovered] : current
}

export function recordingAttemptStatus(attempt: Pick<RecordingAttempt, "status"> & Partial<Pick<RecordingAttempt, "continued_by_job_id">>) {
  if (attempt.continued_by_job_id) return "continued" as const
  if (attempt.status === "blocked") return "review" as const
  if (["failed", "lost", "cancelled"].includes(attempt.status)) return "failed" as const
  if (attempt.status === "warning") return "warning" as const
  if (["queued", "running", "retrying"].includes(attempt.status)) return "pending" as const
  return "ready" as const
}
