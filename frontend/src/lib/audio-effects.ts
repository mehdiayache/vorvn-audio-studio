/** Original Studio descriptors and Web Audio routing, independent of storage and IDs. */
export type AudioEffect = {
    id: string;
    type: "telephone";
    enabled: boolean;
} | {
    id: string;
    type: "echo";
    enabled: boolean;
    delay_ms: number;
    feedback: number;
    mix: number;
} | {
    id: string;
    type: "filter";
    enabled: boolean;
    mode: "lowpass" | "highpass";
    frequency_hz: number;
    q: number;
} | {
    id: string;
    type: "compressor";
    enabled: boolean;
    threshold_db: number;
    ratio: number;
    attack_ms: number;
    release_ms: number;
    makeup_db: number;
} | {
    id: string;
    type: "reverb";
    enabled: boolean;
    room_size: number;
    mix: number;
} | {
    id: string;
    type: "distortion";
    enabled: boolean;
    amount: number;
    mix: number;
} | {
    id: string;
    type: "pan";
    enabled: boolean;
    pan: number;
};
export const AUDIO_EFFECT_LIMIT = 8;
export function validateAudioEffects(raw: unknown): AudioEffect[] {
    if (!Array.isArray(raw) || raw.length > AUDIO_EFFECT_LIMIT)
        throw new Error('INVALID_AUDIO_EFFECTS');
    const ids = new Set<string>();
    return raw.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
            throw new Error('INVALID_AUDIO_EFFECTS');
        const value = item as Record<string, unknown>;
        if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) || ids.has(value.id) || typeof value.enabled !== 'boolean')
            throw new Error('INVALID_AUDIO_EFFECTS');
        ids.add(value.id);
        const shapes: Record<string, string[]> = { telephone: [], echo: ['delay_ms', 'feedback', 'mix'], filter: ['mode', 'frequency_hz', 'q'], compressor: ['threshold_db', 'ratio', 'attack_ms', 'release_ms', 'makeup_db'], reverb: ['room_size', 'mix'], distortion: ['amount', 'mix'], pan: ['pan'] };
        if (typeof value.type !== 'string' || !Object.hasOwn(shapes, value.type))
            throw new Error('INVALID_AUDIO_EFFECTS');
        const keys = ['id', 'type', 'enabled', ...shapes[value.type]];
        if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)))
            throw new Error('INVALID_AUDIO_EFFECTS');
        const number = (key: string, min: number, max: number) => { const n = value[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
            throw new Error('INVALID_AUDIO_EFFECTS'); };
        switch (value.type) {
            case 'echo':
                number('delay_ms', 50, 1000);
                number('feedback', 0, .85);
                number('mix', 0, 1);
                break;
            case 'filter':
                if (value.mode !== 'lowpass' && value.mode !== 'highpass')
                    throw new Error('INVALID_AUDIO_EFFECTS');
                number('frequency_hz', 40, 20000);
                number('q', .1, 18);
                break;
            case 'compressor':
                number('threshold_db', -60, 0);
                number('ratio', 1, 20);
                number('attack_ms', .1, 1000);
                number('release_ms', 10, 3000);
                number('makeup_db', 0, 24);
                break;
            case 'reverb':
                number('room_size', .1, 1);
                number('mix', 0, 1);
                break;
            case 'distortion':
                number('amount', 0, 1);
                number('mix', 0, 1);
                break;
            case 'pan':
                number('pan', -1, 1);
                break;
        }
        return { ...value } as AudioEffect;
    });
}
/** Caller owns every returned node, including feedback loops, and must disconnect on stop. */
export function connectAudioEffects(context: AudioContext, input: AudioNode, effects: readonly AudioEffect[], nodes: AudioNode[]): AudioNode {
    let current = input;
    for (const effect of effects) {
        if (!effect.enabled)
            continue;
        if (effect.type === "telephone") {
            const high = context.createBiquadFilter();
            high.type = "highpass";
            high.frequency.value = 300;
            const low = context.createBiquadFilter();
            low.type = "lowpass";
            low.frequency.value = 3400;
            current.connect(high);
            high.connect(low);
            nodes.push(high, low);
            current = low;
            continue;
        }
        if (effect.type === "filter") {
            const filter = context.createBiquadFilter();
            filter.type = effect.mode;
            filter.frequency.value = effect.frequency_hz;
            filter.Q.value = effect.q;
            current.connect(filter);
            nodes.push(filter);
            current = filter;
            continue;
        }
        if (effect.type === "compressor") {
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.value = effect.threshold_db;
            // FFmpeg acompressor's fixed knee=2.82843 is approximately 9 dB.
            // Keeping the Web Audio knee explicit avoids browser-default drift.
            compressor.knee.value = 9;
            compressor.ratio.value = effect.ratio;
            compressor.attack.value = effect.attack_ms / 1000;
            compressor.release.value = effect.release_ms / 1000;
            const makeup = context.createGain();
            makeup.gain.value = 10 ** (effect.makeup_db / 20);
            current.connect(compressor);
            compressor.connect(makeup);
            nodes.push(compressor, makeup);
            current = makeup;
            continue;
        }
        if (effect.type === "pan") {
            const panner = context.createStereoPanner();
            panner.pan.value = effect.pan;
            current.connect(panner);
            nodes.push(panner);
            current = panner;
            continue;
        }
        if (effect.type === "reverb") {
            const sum = context.createGain();
            const dry = context.createGain();
            dry.gain.value = 1 - effect.mix;
            current.connect(dry);
            dry.connect(sum);
            const scale = .6 + 1.8 * effect.room_size;
            [[.035, .64], [.067, .44], [.113, .29], [.173, .18]].forEach(([delaySeconds, decay]) => {
                const delay = context.createDelay(1);
                const tap = context.createGain();
                delay.delayTime.value = delaySeconds! * scale;
                tap.gain.value = decay! * effect.mix;
                current.connect(delay);
                delay.connect(tap);
                tap.connect(sum);
                nodes.push(delay, tap);
            });
            nodes.push(sum, dry);
            current = sum;
            continue;
        }
        if (effect.type === "distortion") {
            const sum = context.createGain();
            const dry = context.createGain();
            const shaper = context.createWaveShaper();
            const wet = context.createGain();
            const threshold = Math.max(.08, 1 - effect.amount * .85);
            const curve = new Float32Array(2048);
            const normalizer = Math.tanh(1 / threshold);
            for (let index = 0; index < curve.length; index += 1) {
                const inputValue = index / (curve.length - 1) * 2 - 1;
                curve[index] = Math.tanh(inputValue / threshold) / normalizer;
            }
            shaper.curve = curve;
            shaper.oversample = "4x";
            dry.gain.value = 1 - effect.mix;
            wet.gain.value = effect.mix;
            current.connect(dry);
            dry.connect(sum);
            current.connect(shaper);
            shaper.connect(wet);
            wet.connect(sum);
            nodes.push(sum, dry, shaper, wet);
            current = sum;
            continue;
        }
        if (effect.type !== "echo")
            continue;
        const sum = context.createGain();
        const dry = context.createGain();
        const delay = context.createDelay(1);
        const feedback = context.createGain();
        const wet = context.createGain();
        delay.delayTime.value = effect.delay_ms / 1000;
        feedback.gain.value = effect.feedback;
        dry.gain.value = 1 - effect.mix;
        wet.gain.value = effect.mix;
        current.connect(dry);
        dry.connect(sum);
        current.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(sum);
        nodes.push(sum, dry, delay, feedback, wet);
        current = sum;
    }
    return current;
}
