import { beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { loadPartCaptionTracks, loadProductionCaptionTracks } from "@/lib/production-caption-tracks"
import type { ProductionPart, Transcript } from "@/types/domain"

vi.mock("@/lib/api", () => ({ studioApi: { captions: vi.fn(), transcript: vi.fn() } }))

const part = { id: 4, kind: "audio", duration_ms: 2500, subtitled: true } as ProductionPart
const transcript = { id: 8, language: "English", duration_ms: 2500, sentences: [{ start: 100, end: 900, text: "A measured opening line.", words: [] }] } as unknown as Transcript

describe("Production caption tracks", () => {
  beforeEach(() => {
    vi.mocked(studioApi.captions).mockResolvedValue({ transcripts: [{ id: 8, name: "part-4", language: "English", duration_ms: 2500, is_translation: false, stale: false }] })
    vi.mocked(studioApi.transcript).mockResolvedValue(transcript)
  })

  it("keeps cue context tied to its exact Part", async () => {
    const [track] = await loadPartCaptionTracks(2, part)
    expect(track?.label).toBe("English · Original")
    expect(track?.cues[0]).toMatchObject({ startMs: 100, endMs: 900, partId: 4 })
  })

  it("assembles one language timeline using real Sequence offsets", async () => {
    const second = { ...part, id: 5, duration_ms: 1800 } as ProductionPart
    const tracks = await loadProductionCaptionTracks(2, [part, second])
    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.cues.map((cue) => cue.startMs)).toEqual([100, 2600])
    expect(tracks[0]?.cues.map((cue) => cue.partId)).toEqual([4, 5])
  })

  it("uses honest original-caption wording instead of inventing an unknown language", async () => {
    vi.mocked(studioApi.captions).mockResolvedValue({ transcripts: [{ id: 8, name: "part-4", duration_ms: 2500, is_translation: false, stale: false }] })
    vi.mocked(studioApi.transcript).mockResolvedValue({ ...transcript, language: null } as Transcript)
    const [track] = await loadPartCaptionTracks(2, { ...part, language: undefined } as ProductionPart)
    expect(track).toMatchObject({ language: "Original captions", label: "Original captions" })
  })
})
