const voiceDirectoryEvent = "origins:voices-changed"
const voiceDirectoryStorageKey = "vorvn:voices-revision"

export function announceVoiceDirectoryChange() {
  window.localStorage.setItem(voiceDirectoryStorageKey, String(Date.now()))
  window.dispatchEvent(new Event(voiceDirectoryEvent))
}

export function listenForVoiceDirectoryChanges(refresh: () => void) {
  const local = () => refresh()
  const remote = (event: StorageEvent) => {
    if (event.key === voiceDirectoryStorageKey) refresh()
  }
  window.addEventListener(voiceDirectoryEvent, local)
  window.addEventListener("storage", remote)
  return () => {
    window.removeEventListener(voiceDirectoryEvent, local)
    window.removeEventListener("storage", remote)
  }
}
