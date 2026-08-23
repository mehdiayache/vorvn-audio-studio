import { describe, expect, it } from "vitest"

import { compileMusicPrompt, compileSfxPrompt } from "@/lib/audio-generation-prompt"

describe("audio generation prompt compiler", () => {
  it("builds deterministic music direction without calling it a bed", () => {
    const prompt = compileMusicPrompt({
      purpose: "background for reflective narration", mood: "calm, hopeful",
      energy: "low", instruments: "soft piano and bowed strings", tempo: "72 BPM",
      texture: "warm and spacious", avoid: "vocals, dramatic rises", notes: "leave room for speech",
    })
    expect(prompt).toBe("Purpose: background for reflective narration. Mood: calm, hopeful. Energy: low. Instrumentation: soft piano and bowed strings. Tempo: 72 BPM. Texture: warm and spacious. Avoid: vocals, dramatic rises. Additional direction: leave room for speech.")
    expect(prompt).not.toContain("bed")
  })

  it("builds SFX direction from acoustic facts", () => {
    expect(compileSfxPrompt({
      object: "heavy wooden door", action: "closes softly", location: "quiet library",
      perspective: "two metres away", character: "warm, realistic", avoid: "voices, music",
    })).toContain("Listening perspective: two metres away.")
  })
})
