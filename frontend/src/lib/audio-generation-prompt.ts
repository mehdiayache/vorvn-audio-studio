export type MusicGenerationBrief = {
  purpose: string
  mood: string
  energy: string
  instruments: string
  tempo: string
  texture: string
  avoid: string
  notes: string
}

export type SfxGenerationBrief = {
  object: string
  action: string
  location: string
  perspective: string
  character: string
  avoid: string
}

export type AudioGenerationBrief = MusicGenerationBrief | SfxGenerationBrief

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "")
}

function sentence(label: string, value: string) {
  const normalized = clean(value)
  return normalized ? `${label}: ${normalized}.` : ""
}

export function compileMusicPrompt(brief: MusicGenerationBrief) {
  return [
    sentence("Purpose", brief.purpose),
    sentence("Mood", brief.mood),
    sentence("Energy", brief.energy),
    sentence("Instrumentation", brief.instruments),
    sentence("Tempo", brief.tempo),
    sentence("Texture", brief.texture),
    sentence("Avoid", brief.avoid),
    sentence("Additional direction", brief.notes),
  ].filter(Boolean).join(" ").slice(0, 500)
}

export function compileSfxPrompt(brief: SfxGenerationBrief) {
  return [
    sentence("Sound source", brief.object),
    sentence("Action", brief.action),
    sentence("Location", brief.location),
    sentence("Listening perspective", brief.perspective),
    sentence("Sound character", brief.character),
    sentence("Avoid", brief.avoid),
  ].filter(Boolean).join(" ").slice(0, 500)
}

export function compileAudioPrompt(
  capability: "music" | "sfx", brief: AudioGenerationBrief,
) {
  return capability === "music"
    ? compileMusicPrompt(brief as MusicGenerationBrief)
    : compileSfxPrompt(brief as SfxGenerationBrief)
}
