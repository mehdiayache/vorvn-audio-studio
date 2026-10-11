import type { SequenceProjectionSpan } from '@/types/domain';
/** Only the controlled PCM16 mono/16kHz QA WAV fixtures are accepted here. */
export function reviewPcm(bytes: Uint8Array): Int16Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 44 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint16(34, true) !== 16 || new TextDecoder().decode(bytes.subarray(36, 40)) !== 'data')
        throw Error('Unsupported historical QA WAV');
    const length = Math.min(view.getUint32(40, true), bytes.length - 44) / 2, samples = new Int16Array(length);
    for (let index = 0; index < length; index++)
        samples[index] = view.getInt16(44 + index * 2, true);
    return samples;
}
export function reviewPeaks(samples: Int16Array, bars: number) {
    const count = Math.max(1, Math.min(4096, Math.round(bars))), peaks: number[] = [];
    for (let bar = 0; bar < count; bar++) {
        const from = Math.floor(bar * samples.length / count), to = Math.floor((bar + 1) * samples.length / count);
        let peak = 0;
        for (let index = from; index < to; index++)
            peak = Math.max(peak, Math.abs(samples[index]!) / 32768);
        peaks.push(peak);
    }
    return peaks;
}
export function reviewWav(samples: Int16Array): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer), write = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
    write(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
    return bytes;
}
/** Concatenate actual source PCM and true zeros for pauses, without pre-mixing overrides. */
export function createReviewStem(sources: Map<string, Int16Array>) {
    let key = '', url = '';
    return (spans: SequenceProjectionSpan[]) => {
        const next = JSON.stringify(spans.map(span => [span.filename, span.duration_ms, span.silence]));
        if (next === key)
            return url;
        const length = spans.reduce((sum, span) => sum + Math.round(span.duration_ms * 16), 0), samples = new Int16Array(length);
        let cursor = 0;
        for (const span of spans) {
            const count = Math.round(span.duration_ms * 16);
            if (!span.silence) {
                const source = sources.get(span.filename);
                if (!source || source.length < count)
                    throw Error('Historical QA stem source is missing');
                samples.set(source.subarray(0, count), cursor);
            }
            cursor += count;
        }
        if (url)
            URL.revokeObjectURL(url);
        key = next;
        const bytes = reviewWav(samples);
        url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
        return url;
    };
}
