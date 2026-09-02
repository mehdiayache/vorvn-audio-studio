import { originsApi } from "@/lib/api"
import { buildCaptionPlayerTrack, CAPTION_PRESENTATION_MODES } from "@/lib/caption-presentation"
import { partDurationMs } from "@/lib/format"
import type { PlayerCaptionTrack, ProjectPart, Transcript, TranscriptSummary } from "@/types/domain"

function languageLabel(value?: string | null) {
  return String(value || "").trim()
}

function clonePresentations(track: PlayerCaptionTrack) {
  if (!track.presentations) return undefined
  return Object.fromEntries(CAPTION_PRESENTATION_MODES.map(({ key }) => [key, [...track.presentations![key]]])) as PlayerCaptionTrack["presentations"]
}

function sortPresentations(track: PlayerCaptionTrack) {
  if (!track.presentations) return undefined
  return Object.fromEntries(CAPTION_PRESENTATION_MODES.map(({ key }) => [key, track.presentations![key].sort((a, b) => a.startMs - b.startMs)])) as PlayerCaptionTrack["presentations"]
}

async function transcriptTrack(summary: TranscriptSummary, transcript: Transcript, partId: number, offsetMs = 0, sourceLanguage?: string | null): Promise<PlayerCaptionTrack> {
  const language = languageLabel(summary.language || transcript.language || sourceLanguage) || "Original captions"
  return buildCaptionPlayerTrack({
    transcript,
    language,
    label: summary.is_translation ? languageLabel(summary.language) || "Translation" : language === "Original captions" ? language : `${language} · Original`,
    stale: Boolean(summary.stale),
    partId,
    offsetMs,
  })
}

export async function loadPartCaptionTracks(projectId: number, part: ProjectPart): Promise<PlayerCaptionTrack[]> {
  const { transcripts } = await originsApi.captions(projectId, part.id)
  return Promise.all(transcripts.map(async (summary) => transcriptTrack(summary, await originsApi.transcript(summary.id), part.id, 0, part.language)))
}

export async function loadProjectCaptionTracks(projectId: number, parts: ProjectPart[]): Promise<PlayerCaptionTrack[]> {
  const sourceParts = parts.filter((part) => part.kind !== "stitch")
  const offsets = new Map<number, number>()
  let elapsed = 0
  for (const part of sourceParts) {
    offsets.set(part.id, elapsed)
    elapsed += partDurationMs(part)
  }

  const partTracks = await Promise.all(sourceParts
    .filter((part) => Boolean(part.subtitled) && ["audio", "speech"].includes(part.kind))
    .map(async (part) => {
      const { transcripts } = await originsApi.captions(projectId, part.id)
      return Promise.all(transcripts.map(async (summary) => transcriptTrack(
        summary,
        await originsApi.transcript(summary.id),
        part.id,
        offsets.get(part.id) || 0,
        part.language,
      )))
    }))

  const grouped = new Map<string, PlayerCaptionTrack>()
  for (const track of partTracks.flat()) {
    const key = track.language.toLocaleLowerCase()
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        ...track,
        id: `project:${key}`,
        label: track.language,
        cues: [...track.cues],
        presentations: clonePresentations(track),
      })
      continue
    }
    current.stale ||= track.stale
    current.cues.push(...track.cues)
    if (current.presentations && track.presentations) {
      for (const { key: profile } of CAPTION_PRESENTATION_MODES) {
        current.presentations[profile].push(...track.presentations[profile])
      }
    }
  }
  return [...grouped.values()].map((track) => ({
    ...track,
    cues: track.cues.sort((a, b) => a.startMs - b.startMs),
    presentations: sortPresentations(track),
  }))
}
