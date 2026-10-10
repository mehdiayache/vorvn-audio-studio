// Review-only compatibility for legacy callers of the removed waveform hook.
// Missing source media is honestly unavailable; no synthetic peaks are drawn.
export { AudioWaveform, denseWaveformPeaks } from '../components/audio-waveform';
export function useAudioPeaks(_url?: string, _count?: number, _peaksUrl?: string): number[] { return []; }
