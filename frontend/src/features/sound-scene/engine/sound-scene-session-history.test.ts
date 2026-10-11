import { describe, expect, it, vi } from 'vitest';
import { HistoricalReviewModel } from '@/review/historical-review-model';
import { SoundSceneSession } from './sound-scene-session';
describe('SoundSceneSession durable history responses', () => {
    it('adopts undo and redo while saving, even when the parent refresh arrives before the response', async () => {
        const model = new HistoricalReviewModel(() => 'blob:test-stem');
        const playout = { replace: vi.fn(async () => { }), play: vi.fn(async () => { }), pause: vi.fn(), seek: vi.fn(), currentTime: () => 0, isPlaying: () => false, muteTrack: vi.fn(), setTrackVolume: vi.fn(), setClipGain: vi.fn(), dispose: vi.fn() };
        const session = new SoundSceneSession(model.snapshot().soundScene, {
            update: async (document, revision, kind) => model.updateSound(document, revision, kind),
            undo: async () => model.undoSound(), redo: async () => model.redoSound(),
        }, playout);
        const unsubscribe = model.subscribe(() => session.reconcile(model.snapshot().soundScene));
        const track = model.snapshot().soundScene.document.tracks[0]!;
        await session.duplicateClips([{ trackId: track.id, clipId: track.clips[0]!.id }]);
        expect(session.editor.document().tracks[0]?.clips).toHaveLength(2);
        expect(session.snapshot().scene.can_undo).toBe(true);
        await session.undo();
        expect(session.editor.document().tracks[0]?.clips).toHaveLength(1);
        expect(session.snapshot().scene.revision).toBe(3);
        expect(session.snapshot().scene.can_undo).toBe(false);
        expect(session.snapshot().scene.can_redo).toBe(true);
        expect(session.snapshot().saving).toBe(false);
        expect(session.snapshot().revisionKind).toBe('history');
        await session.redo();
        expect(session.editor.document().tracks[0]?.clips).toHaveLength(2);
        expect(session.snapshot().scene.revision).toBe(4);
        expect(session.snapshot().scene.can_redo).toBe(false);
        expect(session.snapshot().scene.can_undo).toBe(true);
        expect(playout.replace).toHaveBeenCalledTimes(3);
        unsubscribe();
        session.dispose();
    });
});
