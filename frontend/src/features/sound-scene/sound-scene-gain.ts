export const MIN_GAIN_DB = -60
export const MAX_GAIN_DB = 6
export const MIN_VOLUME_PERCENT = 0
export const MAX_VOLUME_PERCENT = 200
export const DEFAULT_VOLUME_PERCENT = 100

export function gainToDb(gain: number) {
  if (gain <= .001) return MIN_GAIN_DB
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, 20 * Math.log10(gain)))
}

export function dbToGain(db: number) {
  if (db <= MIN_GAIN_DB) return 0
  return 10 ** (Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, db)) / 20)
}

export function formatDb(db: number, signed = false) {
  if (db <= MIN_GAIN_DB) return "−∞ dB"
  const prefix = signed && db > 0 ? "+" : ""
  return `${prefix}${db.toFixed(1)} dB`
}

export function gainToVolumePercent(gain: number) {
  return Math.round(Math.max(0, Math.min(MAX_VOLUME_PERCENT, gain * 100)))
}

export function volumePercentToGain(percent: number) {
  return Math.max(MIN_VOLUME_PERCENT, Math.min(MAX_VOLUME_PERCENT, percent)) / 100
}
