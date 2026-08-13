import { studioApi } from "@/lib/api"
import { partDurationMs } from "@/lib/format"
import type { PlayerCaptionTrack, ProductionPart, Transcript, TranscriptSummary } from "@/types/domain"

function languageLabel(value?: string | null) {
  return String(value || "").trim()
}

function transcriptTrack(summary: TranscriptSummary, transcript: Transcript, partId: number, offsetMs = 0, sourceLanguage?: string | null): PlayerCaptionTrack {
  const language = languageLabel(summary.language || transcript.language || sourceLanguage) || "Original captions"
  return {
    id: String(summary.id),
    language,
    label: summary.is_translation ? languageLabel(summary.language) || "Translation" : language === "Original captions" ? language : `${language} · Original`,
    stale: Boolean(summary.stale),
    cues: (transcript.sentences || []).map((cue, index, cues) => ({
      startMs: offsetMs + Number(cue.start || 0),
      endMs: offsetMs + Number(cue.end ?? cues[index + 1]?.start ?? transcript.duration_ms ?? cue.start),
      text: cue.text,
      partId,
    })),
  }
}

export async function loadPartCaptionTracks(productionId: number, part: ProductionPart): Promise<PlayerCaptionTrack[]> {
  const { transcripts } = await studioApi.captions(productionId, part.id)
  return Promise.all(transcripts.map(async (summary) => transcriptTrack(summary, await studioApi.transcript(summary.id), part.id, 0, part.language)))
}

export async function loadProductionCaptionTracks(productionId: number, parts: ProductionPart[]): Promise<PlayerCaptionTrack[]> {
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
      const { transcripts } = await studioApi.captions(productionId, part.id)
      return Promise.all(transcripts.map(async (summary) => transcriptTrack(
        summary,
        await studioApi.transcript(summary.id),
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
      grouped.set(key, { ...track, id: `production:${key}`, label: track.language, cues: [...track.cues] })
      continue
    }
    current.stale ||= track.stale
    current.cues.push(...track.cues)
  }
  return [...grouped.values()].map((track) => ({ ...track, cues: track.cues.sort((a, b) => a.startMs - b.startMs) }))
}
