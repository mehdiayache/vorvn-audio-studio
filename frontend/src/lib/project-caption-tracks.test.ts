import { beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { loadPartCaptionTracks, loadProjectCaptionTracks } from "@/lib/project-caption-tracks"
import type { ProjectPart, Transcript } from "@/types/domain"

vi.mock("@/lib/api", () => ({ originsApi: { captions: vi.fn(), transcript: vi.fn(), subtitleLayout: vi.fn() } }))

const part = { id: 4, kind: "audio", duration_ms: 2500, subtitled: true } as ProjectPart
const transcript = { id: 8, language: "English", duration_ms: 2500, sentences: [{ start: 100, end: 900, text: "A measured opening line.", words: [] }] } as unknown as Transcript

describe("Project caption tracks", () => {
  beforeEach(() => {
    vi.mocked(originsApi.captions).mockResolvedValue({ transcripts: [{ id: 8, name: "part-4", language: "English", duration_ms: 2500, is_translation: false, stale: false }] })
    vi.mocked(originsApi.transcript).mockResolvedValue(transcript)
    vi.mocked(originsApi.subtitleLayout).mockImplementation(async (_id, profile) => ({
      profile: { key: profile, label: profile, description: "", max_words: 8, max_chars: 64, line_chars: 32, max_lines: 2, min_duration_ms: 300, max_duration_ms: 5000 },
      cues: [{ start: 100, end: 900, text: profile === "words" ? "Measured" : profile === "short" ? "A measured opening" : "A measured opening line.", words: [], timing: "word" }],
      srt: "", vtt: "", timing_json: "", timing_quality: "word_aligned", metrics: { cues: 1, average_words: 2, maximum_cps: 12 },
    }))
  })

  it("keeps cue context tied to its exact Part", async () => {
    const [track] = await loadPartCaptionTracks(2, part)
    expect(track?.label).toBe("English · Original")
    expect(track?.cues[0]).toMatchObject({ startMs: 100, endMs: 900, partId: 4 })
    expect(track?.presentations?.short[0]?.text).toBe("A measured opening")
    expect(track?.presentations?.words[0]?.text).toBe("Measured")
  })

  it("assembles one language timeline using real Sequence offsets", async () => {
    const second = { ...part, id: 5, duration_ms: 1800 } as ProjectPart
    const tracks = await loadProjectCaptionTracks(2, [part, second])
    expect(tracks).toHaveLength(1)
    expect(tracks[0]?.cues.map((cue) => cue.startMs)).toEqual([100, 2600])
    expect(tracks[0]?.cues.map((cue) => cue.partId)).toEqual([4, 5])
    expect(tracks[0]?.presentations?.words.map((cue) => cue.startMs)).toEqual([100, 2600])
  })

  it("uses honest original-caption wording instead of inventing an unknown language", async () => {
    vi.mocked(originsApi.captions).mockResolvedValue({ transcripts: [{ id: 8, name: "part-4", duration_ms: 2500, is_translation: false, stale: false }] })
    vi.mocked(originsApi.transcript).mockResolvedValue({ ...transcript, language: null } as Transcript)
    const [track] = await loadPartCaptionTracks(2, { ...part, language: undefined } as ProjectPart)
    expect(track).toMatchObject({ language: "Original captions", label: "Original captions" })
  })
})
