import { useSyncExternalStore } from "react"

import { originsApi } from "@/lib/api"
import type { CaptionLayout, CaptionProfile, PlayerCaptionCue, PlayerCaptionTrack, Transcript } from "@/types/domain"

export const CAPTION_PRESENTATION_MODES: ReadonlyArray<{
  key: CaptionProfile
  label: string
  detail: string
}> = [
  { key: "standard", label: "Standard", detail: "Readable · up to 2 lines" },
  { key: "short", label: "Short", detail: "Roughly 2–5 words" },
  { key: "words", label: "Word by word", detail: "One timed word per cue" },
]

export const DEFAULT_CAPTION_PRESENTATION: CaptionProfile = "standard"

const STORAGE_KEY = "origins.caption-presentation"
const listeners = new Set<() => void>()
let memoryProfile: CaptionProfile = DEFAULT_CAPTION_PRESENTATION

export function isCaptionPresentationMode(value: unknown): value is CaptionProfile {
  return CAPTION_PRESENTATION_MODES.some((mode) => mode.key === value)
}

export function captionPresentationMode(profile: CaptionProfile) {
  return CAPTION_PRESENTATION_MODES.find((mode) => mode.key === profile) || CAPTION_PRESENTATION_MODES[0]!
}

function readCaptionPresentation(): CaptionProfile {
  if (typeof window === "undefined") return memoryProfile
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isCaptionPresentationMode(stored)) memoryProfile = stored
  } catch {
    // The in-memory preference still keeps every caption surface synchronized.
  }
  return memoryProfile
}

export function setCaptionPresentation(profile: CaptionProfile) {
  memoryProfile = profile
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, profile) } catch { /* local storage can be unavailable */ }
  }
  listeners.forEach((listener) => listener())
}

function subscribeCaptionPresentation(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCaptionPresentation(): [CaptionProfile, (profile: CaptionProfile) => void] {
  const profile = useSyncExternalStore(subscribeCaptionPresentation, readCaptionPresentation, () => DEFAULT_CAPTION_PRESENTATION)
  return [profile, setCaptionPresentation]
}

function productionLayout(layout: CaptionLayout, partId: number | undefined, offsetMs: number): PlayerCaptionCue[] {
  return layout.cues.map((cue, index, cues) => ({
    startMs: offsetMs + Number(cue.start || 0),
    endMs: offsetMs + Number(cue.end ?? cues[index + 1]?.start ?? cue.start),
    text: cue.text,
    partId,
  }))
}

export async function loadCaptionPresentations({
  transcriptId,
  partId,
  offsetMs,
  fallback,
}: {
  transcriptId: number
  partId?: number
  offsetMs: number
  fallback: PlayerCaptionCue[]
}): Promise<Record<CaptionProfile, PlayerCaptionCue[]>> {
  const entries = await Promise.all(CAPTION_PRESENTATION_MODES.map(async ({ key }) => {
    try {
      return [key, productionLayout(await originsApi.subtitleLayout(transcriptId, key), partId, offsetMs)] as const
    } catch {
      return [key, fallback] as const
    }
  }))
  return Object.fromEntries(entries) as Record<CaptionProfile, PlayerCaptionCue[]>
}

export async function buildCaptionPlayerTrack({
  transcript,
  language,
  label,
  stale = false,
  partId,
  offsetMs = 0,
}: {
  transcript: Transcript
  language: string
  label: string
  stale?: boolean
  partId?: number
  offsetMs?: number
}): Promise<PlayerCaptionTrack> {
  const fallback: PlayerCaptionCue[] = (transcript.sentences || []).map((cue, index, cues) => ({
    startMs: offsetMs + Number(cue.start || 0),
    endMs: offsetMs + Number(cue.end ?? cues[index + 1]?.start ?? transcript.duration_ms ?? cue.start),
    text: cue.text,
    partId,
  }))
  const presentations = await loadCaptionPresentations({ transcriptId: transcript.id, partId, offsetMs, fallback })
  return { id: String(transcript.id), language, label, stale, cues: presentations.standard, presentations }
}
