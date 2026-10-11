import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SoundSceneSession } from '@/features/sound-scene/engine/sound-scene-session';
import { VisualSceneSession } from '@/features/visual-scene/engine/visual-scene-session';
import { HistoricalReviewModel, REVIEW_AUDIO_NAMES, reviewFiles } from './historical-review-model';
import { createReviewStem, reviewPcm, reviewPeaks, reviewWav } from './historical-review-media';
export function reviewPlayout() {
    return {
        replace: vi.fn(async () => { }), play: vi.fn(async () => { }), pause: vi.fn(),
        seek: vi.fn(), currentTime: () => 0, isPlaying: () => false,
        muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn(),
    };
}
function model() { return new HistoricalReviewModel(() => 'blob:local-qa-stem'); }
function audioSession(store: HistoricalReviewModel) {
    return new SoundSceneSession(store.snapshot().soundScene, {
        update: async (document, revision, kind) => store.updateSound(document, revision, kind),
        undo: async () => store.undoSound(), redo: async () => store.redoSound(),
    }, reviewPlayout());
}
describe('isolated historical QA source ports', () => {
    it('projects actual source Files and silence in narrative order', () => {
        const store = model();
        const scene = store.snapshot().soundScene;
        expect(scene.resolved.sequence_projection.duration_ms).toBe(13500);
        expect(scene.resolved.sequence_projection.spans.map(span => [span.start_ms, span.duration_ms, span.silence]))
            .toEqual([[0, 6000, false], [6000, 1500, true], [7500, 6000, false]]);
        expect(scene.resolved.tracks[0]?.clips[0]).toMatchObject({ file_id: 103, file_version_id: 1, source_duration_ms: 18000, source_offset_ms: 1000, resolved_start_ms: 1000, resolved_duration_ms: 12000, missing: false });
        store.reorder([3, 2, 1, 4]);
        expect(store.snapshot().soundScene.resolved.sequence_projection.spans[0]?.filename).toBe(REVIEW_AUDIO_NAMES[1]);
    });
    it('runs original audio session duplicate, split, nudge and mix against local persistence', async () => {
        const store = model(), session = audioSession(store);
        const track = store.snapshot().soundScene.document.tracks[0]!;
        const ref = { trackId: track.id, clipId: track.clips[0]!.id };
        await session.duplicateClips([ref]);
        expect(store.snapshot().soundScene.document.tracks[0]?.clips).toHaveLength(2);
        expect(session.selectedClips()[0]).not.toEqual(ref);
        expect(session.currentClip(track.id, session.selectedClips()[0]!.clipId)?.anchor).toEqual({ kind: 'absolute', position_ms: 13000 });
        expect(await session.splitClipsAtPlayhead([ref], 5)).toBe(true);
        const left = session.currentClip(ref.trackId, ref.clipId)!;
        expect(left.duration_ms).toBe(4000);
        const right = store.snapshot().soundScene.document.tracks[0]!.clips.find(clip => clip.source_offset_ms === 5000)!;
        expect(right).toMatchObject({ file_id: 103, file_version_id: 1, duration_ms: 8000, anchor: { kind: 'absolute', position_ms: 5000 } });
        await session.nudgeClips(-500, [ref]);
        await session.commitClipChanges(ref.trackId, ref.clipId, { gain: .25, effects: [{ id: 'qa-telephone', type: 'telephone', enabled: true }] });
        expect(store.snapshot().soundScene.document.tracks[0]?.clips[0]).toMatchObject({ gain: .25, effects: [{ id: 'qa-telephone', type: 'telephone', enabled: true }], anchor: { kind: 'absolute', position_ms: 500 } });
        await session.commitTrackMix(track.id, { volume: .7, muted: false });
        expect(store.snapshot().soundScene.document.tracks[0]?.volume).toBe(.7);
        session.dispose();
    });
    it('uses original gesture geometry and adds a real audio File with unchanged identity', async () => {
        const store = model(), session = audioSession(store);
        const track = store.snapshot().soundScene.document.tracks[0]!;
        const clipId = track.clips[0]!.id;
        session.beginGesture();
        session.moveClip(track.id, clipId, 48000);
        session.trimClip(track.id, clipId, 'left', 48000);
        await session.commitGesture();
        expect(store.snapshot().soundScene.document.tracks[0]?.clips[0]).toMatchObject({ source_offset_ms: 2000, duration_ms: 11000, anchor: { kind: 'absolute', position_ms: 3000 } });
        await session.addClip(track.id, reviewFiles[3]!, 2);
        expect(store.snapshot().soundScene.document.tracks[0]?.clips[1]).toMatchObject({ file_id: 104, file_version_id: 1, anchor: { kind: 'absolute', position_ms: 2000 } });
        session.dispose();
    });
    it('runs the original image gesture, transform and visual undo/redo', async () => {
        const store = model();
        const session = new VisualSceneSession(store.snapshot().visualScene, {
            update: async (document, revision) => store.updateVisual(document, revision),
        }, 13500);
        const track = store.snapshot().visualScene.document.tracks[0]!;
        const ref = { trackId: track.id, clipId: track.clips[0]!.id };
        session.beginGesture();
        session.moveClip(ref, 3000);
        session.trimClip(ref, 'end', 9000);
        await session.commitGesture();
        await session.setClipTransform(ref, { scale: 1.4, rotation_degrees: 15, opacity: .65 });
        expect(session.currentClip(ref)).toMatchObject({ start_ms: 3000, duration_ms: 6000, scale: 1.4, rotation_degrees: 15, opacity: .65 });
        await session.undo();
        expect(session.currentClip(ref)).toMatchObject({ scale: 1, rotation_degrees: 0, opacity: 1, start_ms: 3000 });
        await session.redo();
        expect(store.snapshot().visualScene.document.tracks[0]?.clips[0]).toMatchObject({ scale: 1.4, rotation_degrees: 15, opacity: .65 });
        await session.addImage(reviewFiles[4]!, 1000, track.id);
        expect(store.snapshot().visualScene.document.tracks[0]?.clips[1]).toMatchObject({ file_id: 105, start_ms: 1000, duration_ms: 5000 });
    });
    it('rejects stale revisions and does not let muted effect tails extend composition duration', () => {
        const store = model();
        const document = structuredClone(store.snapshot().soundScene.document);
        document.tracks[0]!.clips[0]!.effects = [{ id: 'qa-echo', type: 'echo', enabled: true, delay_ms: 1000, feedback: .85, mix: .8 }];
        store.updateSound(document, 1);
        expect(store.snapshot().soundScene.resolved.duration_ms).toBeGreaterThan(13500);
        expect(() => store.updateSound(document, 1)).toThrow('revision conflict');
        document.tracks[0]!.muted = true;
        store.updateSound(document, 2);
        expect(store.snapshot().soundScene.resolved.duration_ms).toBe(13500);
    });
});
describe('controlled local QA media', () => {
    it('reads real PCM WAV fixtures and computes their actual sample peaks', () => {
        for (const name of REVIEW_AUDIO_NAMES) {
            const bytes = readFileSync(new URL(`../../public/review-media/${name}`, import.meta.url));
            const samples = reviewPcm(bytes);
            expect(samples.length).toBeGreaterThanOrEqual(4 * 16000);
            expect(reviewPeaks(samples, 48)).toHaveLength(48);
            expect(Math.max(...reviewPeaks(samples, 48))).toBeGreaterThan(0);
            expect(reviewPcm(reviewWav(samples))).toEqual(samples);
        }
    });
    it('builds the original sequence stem from the actual source PCM plus true silent pauses', async () => {
        const sources = new Map(REVIEW_AUDIO_NAMES.map(name => [name, reviewPcm(readFileSync(new URL(`../../public/review-media/${name}`, import.meta.url)))]));
        const stem = createReviewStem(sources);
        const store = new HistoricalReviewModel(stem);
        const first = store.snapshot().soundScene.sequence_stem!.url;
        const pcm = reviewPcm(new Uint8Array(await (await fetch(first)).arrayBuffer()));
        expect(pcm.length).toBe(13500 * 16);
        expect(pcm.subarray(0, 6000 * 16)).toEqual(sources.get(REVIEW_AUDIO_NAMES[0]));
        expect(pcm.subarray(6000 * 16, 7500 * 16).every(sample => sample === 0)).toBe(true);
        expect(pcm.subarray(7500 * 16)).toEqual(sources.get(REVIEW_AUDIO_NAMES[1]));
        expect(stem(store.snapshot().soundScene.resolved.sequence_projection.spans)).toBe(first);
        store.reorder([3, 2, 1, 4]);
        expect(store.snapshot().soundScene.sequence_stem!.url).not.toBe(first);
    });
});
