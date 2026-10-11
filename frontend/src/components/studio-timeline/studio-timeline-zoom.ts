/** Actual Studio viewport scale, shared by the original engine and Project host. */
const SAMPLE_RATE = 48_000
const MIN_SAMPLES_PER_PIXEL = 300
export const SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL = 4_800
const MIN_TIMELINE_PIXELS_PER_SECOND = .5
const MAX_SAMPLES_PER_PIXEL = SAMPLE_RATE / MIN_TIMELINE_PIXELS_PER_SECOND
const ZOOM_STEP_RATIO = 1.14

function buildZoomLevels() {
  const levels = new Set<number>([
    MIN_SAMPLES_PER_PIXEL,
    SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL,
    MAX_SAMPLES_PER_PIXEL,
  ])
  for (let value = SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL / ZOOM_STEP_RATIO; value > MIN_SAMPLES_PER_PIXEL; value /= ZOOM_STEP_RATIO)
    levels.add(Math.round(value))
  for (let value = SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL * ZOOM_STEP_RATIO; value < MAX_SAMPLES_PER_PIXEL; value *= ZOOM_STEP_RATIO)
    levels.add(Math.round(value))
  return [...levels].sort((left, right) => left - right)
}

export const SOUND_SCENE_ZOOM_LEVELS = Object.freeze(buildZoomLevels())

export function soundSceneZoomIndex(samplesPerPixel: number) {
  const level = SOUND_SCENE_ZOOM_LEVELS.reduce((best, candidate) =>
    Math.abs(candidate - samplesPerPixel) < Math.abs(best - samplesPerPixel) ? candidate : best)
  return SOUND_SCENE_ZOOM_LEVELS.length - 1 - SOUND_SCENE_ZOOM_LEVELS.indexOf(level)
}

export function soundSceneZoomLevel(index: number) {
  const bounded = Math.max(0, Math.min(SOUND_SCENE_ZOOM_LEVELS.length - 1, Math.round(index)))
  return SOUND_SCENE_ZOOM_LEVELS[SOUND_SCENE_ZOOM_LEVELS.length - 1 - bounded]!
}

export function soundSceneFitZoomIndex(durationSeconds: number, viewportPixels: number) {
  const target = Math.max(
    MIN_SAMPLES_PER_PIXEL,
    Math.max(0, durationSeconds) * SAMPLE_RATE / Math.max(1, viewportPixels),
  )
  const level = SOUND_SCENE_ZOOM_LEVELS.find((candidate) => candidate >= target)
    ?? SOUND_SCENE_ZOOM_LEVELS[SOUND_SCENE_ZOOM_LEVELS.length - 1]!
  return SOUND_SCENE_ZOOM_LEVELS.length - 1 - SOUND_SCENE_ZOOM_LEVELS.indexOf(level)
}
