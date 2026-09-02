import { beforeEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"
import { buildCaptionPlayerTrack, CAPTION_PRESENTATION_MODES } from "@/lib/caption-presentation"
import type { Transcript } from "@/types/domain"

vi.mock("@/lib/api", () => ({ originsApi: { subtitleLayout: vi.fn() } }))

const transcript = {
  id: 42,
  duration_ms: 1800,
  sentences: [{ start: 100, end: 1700, text: "A complete editorial sentence.", words: [] }],
} as unknown as Transcript

describe("caption presentation", () => {
  beforeEach(() => {
    vi.mocked(originsApi.subtitleLayout).mockImplementation(async (_id, profile) => ({
      profile: { key: profile, label: profile, description: "", max_words: 8, max_chars: 64, line_chars: 32, max_lines: 2, min_duration_ms: 300, max_duration_ms: 5000 },
      cues: [{ start: 100, end: 1700, text: profile === "words" ? "Editorial" : profile === "short" ? "Complete editorial" : "A complete editorial sentence.", words: [], timing: "word" }],
      srt: "", vtt: "", timing_json: "", timing_quality: "word_aligned", metrics: { cues: 1, average_words: 2, maximum_cps: 12 },
    }))
  })

  it("keeps the three presentation choices in one reusable registry", () => {
    expect(CAPTION_PRESENTATION_MODES.map((mode) => mode.key)).toEqual(["standard", "short", "words"])
  })

  it("builds every free player timeline from one saved transcript", async () => {
    const track = await buildCaptionPlayerTrack({ transcript, language: "English", label: "English" })
    expect(originsApi.subtitleLayout).toHaveBeenCalledTimes(3)
    expect(track.cues[0]?.text).toBe("A complete editorial sentence.")
    expect(track.presentations?.short[0]).toMatchObject({ startMs: 100, endMs: 1700, text: "Complete editorial" })
    expect(track.presentations?.words[0]).toMatchObject({ text: "Editorial", partId: undefined })
  })
})
