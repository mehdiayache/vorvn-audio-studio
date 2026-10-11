import type { Production, ProductionPart, SequenceMixOverride, SequenceProjectionSpan, SoundScene, SoundSceneDocument, SoundSceneEffect, VisualScene, VisualSceneDocument, WorkspaceFile } from '@/types/domain';
/** Local source/persistence ports for the original sessions. No production services. */
export const REVIEW_AUDIO_NAMES = ['review-qa-opening.wav', 'review-qa-dialogue.wav', 'review-qa-music.wav', 'review-qa-effect.wav'] as const;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const defaultMix = (): SequenceMixOverride => ({ muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] });
export const reviewFiles: WorkspaceFile[] = [
    { id: 101, name: 'Opening · synthetic QA pulse', filename: REVIEW_AUDIO_NAMES[0], media_type: 'audio', mime_type: 'audio/wav', duration_ms: 6000, sample_rate: 16000, channels: 1, category: 'speech', version_id: 1, url: `/audio/${REVIEW_AUDIO_NAMES[0]}` },
    { id: 102, name: 'Dialogue · synthetic QA pulse', filename: REVIEW_AUDIO_NAMES[1], media_type: 'audio', mime_type: 'audio/wav', duration_ms: 6000, sample_rate: 16000, channels: 1, category: 'speech', version_id: 1, url: `/audio/${REVIEW_AUDIO_NAMES[1]}` },
    { id: 103, name: 'Music · synthetic QA chord', filename: REVIEW_AUDIO_NAMES[2], media_type: 'audio', mime_type: 'audio/wav', duration_ms: 18000, sample_rate: 16000, channels: 1, category: 'music', version_id: 1, url: `/audio/${REVIEW_AUDIO_NAMES[2]}` },
    { id: 104, name: 'Sound effect · synthetic QA clicks', filename: REVIEW_AUDIO_NAMES[3], media_type: 'audio', mime_type: 'audio/wav', duration_ms: 4000, sample_rate: 16000, channels: 1, category: 'sfx', version_id: 1, url: `/audio/${REVIEW_AUDIO_NAMES[3]}` },
    { id: 105, name: 'Geometric landscape · local QA image', filename: 'review-qa-image.svg', media_type: 'image', mime_type: 'image/svg+xml', width: 1920, height: 1080, version_id: 1, url: '/origins/review-media/review-qa-image.svg' },
];
function initialProduction(): Production {
    const parts: ProductionPart[] = [
        { id: 1, public_id: id(1), created_at: '2026-10-11', position: 0, enabled: true, kind: 'file', title: 'Opening · QA signal', authored_role: 'Narrator', text: 'A quiet morning. The first light reaches the mountains.', file_id: 101, file_version_id: 1, filename: REVIEW_AUDIO_NAMES[0], duration_ms: 6000, cost: 0 },
        { id: 2, public_id: id(2), created_at: '2026-10-11', position: 1, enabled: true, kind: 'silence', title: 'Pause', text: '', duration_ms: 1500, cost: 0 },
        { id: 3, public_id: id(3), created_at: '2026-10-11', position: 2, enabled: true, kind: 'file', title: 'Dialogue · QA signal', authored_role: 'Guide', text: 'Take your time. There is more to hear along the way.', file_id: 102, file_version_id: 1, filename: REVIEW_AUDIO_NAMES[1], duration_ms: 6000, cost: 0 },
        { id: 4, public_id: id(4), created_at: '2026-10-11', position: 3, enabled: false, kind: 'draft', title: 'Editable draft · no generated media', authored_role: 'Narrator', text: 'This optional line is disabled.', cost: 0 },
    ];
    return { id: 1, public_id: 'local-comparison', production_type: 'audiovisual', name: 'Original Studio comparison', description: 'Isolated QA source sessions; synthetic local media', status: 'draft', workspace_id: 1, project_id: null, settings: {}, parts, exports: [], total_cost: 0, current_sequence_cost: 0, accounting: { historical_spend: 0, current_sequence_cost: 0, retained_generation_cost: 0, tracked_spend: 0 }, total_bytes: 0 };
}
function initialSound(): SoundSceneDocument {
    return { version: 1, sequence_overrides: {}, tracks: [{ id: id(10), kind: 'audio', role: 'music', name: 'Music', volume: 1, muted: false, clips: [{ id: id(11), file_id: 103, file_version_id: 1, duration_ms: 12000, source_offset_ms: 1000, gain: .5, fade_in_ms: 0, fade_out_ms: 0, loop: false, ducking: false, muted: false, locked: false, effects: [], anchor: { kind: 'absolute', position_ms: 1000 } }] }] };
}
function initialVisual(): VisualSceneDocument {
    return { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [{ id: id(20), name: 'Images', media_type: 'image', visible: true, locked: false, clips: [{ id: id(21), file_id: 105, start_ms: 0, duration_ms: 6000, source_offset_ms: 0, fit: 'contain', position_x: 0, position_y: 0, scale: 1, rotation_degrees: 0, flip_horizontal: false, flip_vertical: false, opacity: 1, locked: false }] }] };
}
function effectTail(effects: SoundSceneEffect[]) {
    let tail = 0;
    for (const effect of effects) {
        if (!effect.enabled)
            continue;
        if (effect.type === 'echo' && effect.mix > 0) {
            const repeats = effect.feedback <= 0 ? 1 : Math.ceil(Math.log(.01) / Math.log(effect.feedback));
            tail += effect.delay_ms * repeats;
        }
        if (effect.type === 'reverb' && effect.mix > 0)
            tail = Math.max(tail, Math.ceil(.173 * (.6 + 1.8 * effect.room_size) * 1000));
    }
    return tail;
}
export type HistoricalReviewSnapshot = {
    production: Production;
    soundScene: SoundScene;
    visualScene: VisualScene;
};
export class HistoricalReviewModel {
    private production = initialProduction();
    private soundDocument = initialSound();
    private visualDocument = initialVisual();
    private audioRevision = 1;
    private visualRevision = 1;
    private undo: SoundSceneDocument[] = [];
    private redo: SoundSceneDocument[] = [];
    private listeners = new Set<() => void>();
    private snapshotValue: HistoricalReviewSnapshot;
    constructor(private stem: (spans: SequenceProjectionSpan[]) => string) { this.snapshotValue = this.resolve(); }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    snapshot = () => this.snapshotValue;
    private publish() { this.snapshotValue = this.resolve(); for (const listener of this.listeners)
        listener(); }
    private resolve(): HistoricalReviewSnapshot {
        let cursor = 0;
        const spans: SequenceProjectionSpan[] = this.production.parts.filter(part => part.enabled !== false).flatMap(part => {
            const duration = Math.max(0, Number(part.duration_ms || 0));
            if (!duration)
                return [];
            const override = this.soundDocument.sequence_overrides[part.public_id || String(part.id)] || defaultMix();
            const span: SequenceProjectionSpan = { part_id: part.id, part_public_id: part.public_id || String(part.id), position: part.position, kind: part.kind, title: part.title || '', role: part.authored_role || '', voice_name: part.voice_name || '', filename: part.filename || '', start_ms: cursor, duration_ms: duration, silence: part.kind === 'silence', missing: part.kind !== 'silence' && !part.filename, mix: { ...defaultMix(), ...override, fade_in_ms: Math.min(duration, override.fade_in_ms), fade_out_ms: Math.min(duration, override.fade_out_ms) } };
            cursor += duration;
            span.effect_tail_ms = effectTail(span.mix.effects);
            return [span];
        });
        const byPart = new Map(spans.map(span => [span.part_public_id, span]));
        const orphans: SoundScene['resolved']['orphans'] = [];
        const tracks = this.soundDocument.tracks.map(track => ({ ...track, clips: track.clips.map(clip => {
                const file = reviewFiles.find(file => file.id === clip.file_id), target = clip.anchor.kind === 'part' ? byPart.get(clip.anchor.part_public_id) : undefined;
                const start = clip.anchor.kind === 'absolute' ? clip.anchor.position_ms : target ? Math.max(0, target.start_ms + (clip.anchor.edge === 'end' ? target.duration_ms : 0) + clip.anchor.offset_ms) : null;
                const requested = clip.duration_ms ?? Math.max(0, cursor - (start || 0)), physical = Number(file?.duration_ms || 0);
                const duration = start === null ? 0 : clip.loop ? requested : Math.min(requested, Math.max(0, physical - clip.source_offset_ms));
                if (start === null)
                    orphans.push({ track_id: track.id, clip_id: clip.id, reason: 'anchor_part_missing' });
                return { ...clip, file_name: file?.name || '', file_kind: file?.category || 'audio', filename: file?.filename || '', source_media_type: 'audio' as const, source_duration_ms: physical, missing: !file, resolved_start_ms: start, resolved_duration_ms: duration, fade_in_ms: Math.min(clip.fade_in_ms, duration), fade_out_ms: Math.min(clip.fade_out_ms, duration), orphan: start === null, orphan_reason: start === null ? 'anchor_part_missing' : null, effect_tail_ms: effectTail(clip.effects) };
            }) }));
        const duration = Math.max(cursor, ...tracks.filter(track => !track.muted && track.volume > 0).flatMap(track => track.clips.filter(clip => !clip.muted && clip.gain > 0 && !clip.missing && !clip.orphan).map(clip => (clip.resolved_start_ms || 0) + clip.resolved_duration_ms + clip.effect_tail_ms)), ...spans.filter(span => !span.mix.muted && span.mix.gain > 0).map(span => span.start_ms + span.duration_ms + (span.effect_tail_ms || 0)));
        const signature = JSON.stringify([this.audioRevision, spans, tracks]);
        const soundScene: SoundScene = { production_id: 1, revision: this.audioRevision, document: structuredClone(this.soundDocument), can_undo: !!this.undo.length, can_redo: !!this.redo.length, updated_at: new Date().toISOString(), resolved: { version: 1, signature, duration_ms: duration, sequence_projection: { signature, duration_ms: cursor, sample_rate: 48000, spans }, tracks, orphans }, sequence_stem: { url: this.stem(spans), filename: 'review-qa-script-stem.wav', duration_ms: cursor, signature, cached: false } };
        return { production: structuredClone(this.production), soundScene, visualScene: { production_id: 1, revision: this.visualRevision, document: structuredClone(this.visualDocument), updated_at: new Date().toISOString() } };
    }
    updateSound(document: SoundSceneDocument, expectedRevision: number, kind = 'operator') {
        if (expectedRevision !== this.audioRevision)
            throw Error('Local QA sound revision conflict');
        if (kind === 'operator') {
            this.undo.push(structuredClone(this.soundDocument));
            this.redo = [];
        }
        this.soundDocument = structuredClone(document);
        this.audioRevision++;
        this.publish();
        return this.snapshotValue.soundScene;
    }
    undoSound() { if (this.undo.length) {
        this.redo.push(this.soundDocument);
        this.soundDocument = this.undo.pop()!;
        this.audioRevision++;
        this.publish();
    } return this.snapshotValue.soundScene; }
    redoSound() { if (this.redo.length) {
        this.undo.push(this.soundDocument);
        this.soundDocument = this.redo.pop()!;
        this.audioRevision++;
        this.publish();
    } return this.snapshotValue.soundScene; }
    updateVisual(document: VisualSceneDocument, expectedRevision: number) {
        if (expectedRevision !== this.visualRevision)
            throw Error('Local QA visual revision conflict');
        this.visualDocument = structuredClone(document);
        this.visualRevision++;
        this.publish();
        return this.snapshotValue.visualScene;
    }
    rename(name: string) { this.production.name = name; this.publish(); return this.snapshotValue.production; }
    reorder(order: number[]) {
        if (order.length !== this.production.parts.length || new Set(order).size !== order.length || order.some(id => !this.production.parts.some(part => part.id === id)))
            throw Error('Local QA part order is invalid');
        this.production.parts = order.map((id, position) => ({ ...this.production.parts.find(part => part.id === id)!, position }));
        this.scriptChanged();
    }
    editPart(id: number, changes: Partial<ProductionPart>) { const part = this.production.parts.find(part => part.id === id); if (!part)
        throw Error('Local QA part is missing'); Object.assign(part, changes); this.scriptChanged(); }
    duplicatePart(id: number) { const index = this.production.parts.findIndex(part => part.id === id); if (index < 0)
        throw Error('Local QA part is missing'); const next = Math.max(...this.production.parts.map(part => part.id)) + 1; this.production.parts.splice(index + 1, 0, { ...structuredClone(this.production.parts[index]!), id: next, public_id: crypto.randomUUID() }); this.renumber(); this.scriptChanged(); return next; }
    removeParts(ids: number[]) { this.production.parts = this.production.parts.filter(part => !ids.includes(part.id)); this.renumber(); this.scriptChanged(); }
    addPause(seconds: number, before: string | null) { const next = Math.max(0, ...this.production.parts.map(part => part.id)) + 1, index = before ? this.production.parts.findIndex(part => part.public_id === before) : this.production.parts.length; this.production.parts.splice(index < 0 ? this.production.parts.length : index, 0, { id: next, public_id: crypto.randomUUID(), created_at: new Date().toISOString(), position: 0, enabled: true, kind: 'silence', title: 'Pause', text: '', duration_ms: Math.max(100, Math.round(seconds * 1000)), cost: 0 }); this.renumber(); this.scriptChanged(); return next; }
    private renumber() { this.production.parts.forEach((part, position) => { part.position = position; }); }
    private scriptChanged() { this.undo = []; this.redo = []; this.audioRevision++; this.publish(); }
}
