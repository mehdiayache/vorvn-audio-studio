export function belongsToRecordingSession(executionSessionId: string, activeSessionId: string) {
  return executionSessionId === activeSessionId
}
