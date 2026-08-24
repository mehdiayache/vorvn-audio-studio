export type WaveformProjection = {
  clipDuration: number
  sourceDuration: number
  sourceOffset: number
  loop: boolean
}

export function waveformPeakIndex(
  column: number,
  columns: number,
  peakCount: number,
  projection: WaveformProjection,
) {
  if (peakCount <= 1 || projection.sourceDuration <= 0) return 0
  const localTime = (column + .5) / Math.max(1, columns) * Math.max(0, projection.clipDuration)
  const boundedOffset = projection.loop
    ? ((projection.sourceOffset % projection.sourceDuration) + projection.sourceDuration) % projection.sourceDuration
    : Math.max(0, Math.min(projection.sourceDuration, projection.sourceOffset))
  const sourceTime = projection.loop
    ? (boundedOffset + localTime) % projection.sourceDuration
    : Math.min(projection.sourceDuration, boundedOffset + localTime)
  return Math.min(peakCount - 1, Math.floor(sourceTime / projection.sourceDuration * peakCount))
}

export function loopBoundaryTimes(projection: WaveformProjection) {
  if (!projection.loop || projection.sourceDuration <= 0 || projection.clipDuration <= 0) return []
  const offset = ((projection.sourceOffset % projection.sourceDuration) + projection.sourceDuration) % projection.sourceDuration
  const first = offset === 0 ? projection.sourceDuration : projection.sourceDuration - offset
  const boundaries: number[] = []
  for (let time = first; time < projection.clipDuration; time += projection.sourceDuration)
    boundaries.push(time)
  return boundaries
}
