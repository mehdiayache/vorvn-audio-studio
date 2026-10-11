import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalPlayerProvider } from '@/components/global-player-provider';
import { ProductReadinessProvider } from '@/components/product-readiness';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AudiovisualProductionPage } from '@/features/productions/audiovisual/audiovisual-production-page';
import { originsApi } from '@/lib/api';
import { HistoricalReviewModel, REVIEW_AUDIO_NAMES, reviewFiles } from './historical-review-model';
import { createReviewStem, reviewPcm, reviewPeaks } from './historical-review-media';
import '@fontsource-variable/inter';
import '@/styles/base.css';
import '@/styles/studio-deck.css';
// The page and editing sessions are original. Only their backend/source ports
// are replaced here with an explicitly local QA model and named fixture Files.
const originalFetch = window.fetch.bind(window);
const sources = new Map<string, Int16Array>();
for (const name of REVIEW_AUDIO_NAMES) {
    const response = await originalFetch(`/origins/review-media/${name}`);
    if (!response.ok)
        throw Error(`QA fixture missing: ${name}`);
    sources.set(name, reviewPcm(new Uint8Array(await response.arrayBuffer())));
}
const blockedRequests: Array<{
    method: string;
    path: string;
}> = [];
window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), location.href);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const peakName = url.pathname.match(/^\/api\/v1\/media\/peaks\/(review-qa-(?:opening|dialogue|music|effect)\.wav)$/)?.[1];
    if (method === 'GET' && url.origin === location.origin && peakName) {
        const pcm = sources.get(peakName)!;
        return Response.json({ data: { peaks: reviewPeaks(pcm, Number(url.searchParams.get('bars')) || 128) } });
    }
    const audioName = url.pathname.match(/^\/audio\/(review-qa-(?:opening|dialogue|music|effect)\.wav)$/)?.[1];
    if (method === 'GET' && url.origin === location.origin && audioName)
        return originalFetch(`/origins/review-media/${audioName}`, init);
    if (method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/audio') || url.pathname.startsWith('/download')) {
        blockedRequests.push({ method, path: url.pathname });
        return new Response(JSON.stringify({ detail: 'Historical QA only: production backend, generation, uploads, captions jobs and exports are unavailable. Use Timeline Play for local composition preview.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
};
const model = new HistoricalReviewModel(createReviewStem(sources));
Object.assign(originsApi, {
    updateSoundScene: async (_id: number, revision: number, document: Parameters<HistoricalReviewModel['updateSound']>[0], kind?: string) => model.updateSound(document, revision, kind),
    undoSoundScene: async () => model.undoSound(), redoSoundScene: async () => model.redoSound(),
    updateVisualScene: async (_id: number, revision: number, document: Parameters<HistoricalReviewModel['updateVisual']>[0]) => model.updateVisual(document, revision),
    updateProduction: async (_id: number, changes: {
        name?: string;
    }) => model.rename(changes.name || model.snapshot().production.name),
    reorder: async (_id: number, order: number[]) => { model.reorder(order); return { ok: true }; },
    savePartEditorial: async (_production: number, id: number, values: {
        script?: string;
        authored_role?: string;
    }) => { model.editPart(id, { ...(values.script === undefined ? {} : { text: values.script }), ...(values.authored_role === undefined ? {} : { authored_role: values.authored_role }) }); return { ok: true }; },
    setPartEnabled: async (_production: number, id: number, enabled: boolean) => { model.editPart(id, { enabled }); return { ok: true }; },
    editSilence: async (_production: number, id: number, seconds: number) => { model.editPart(id, { duration_ms: Math.max(100, Math.round(seconds * 1000)) }); return { ok: true }; },
    addSilence: async (_production: number, seconds: number, before: string | null) => ({ id: model.addPause(seconds, before) }),
    duplicatePart: async (_production: number, id: number) => ({ id: model.duplicatePart(id) }),
    deletePart: async (_production: number, id: number) => { model.removeParts([id]); return { ok: true }; },
    deleteParts: async (_production: number, ids: number[]) => { model.removeParts(ids); return { ok: true }; },
    captions: async () => ({ transcripts: [] }),
});
// Read-only observability for browser QA; it cannot mutate the editing sessions.
Object.defineProperty(window, '__VEVOLD_HISTORICAL_QA__', { value: { snapshot: () => structuredClone(model.snapshot()), blockedRequests: () => structuredClone(blockedRequests), mediaNames: [...REVIEW_AUDIO_NAMES] }, configurable: true });
const resources = { folders: [], files: reviewFiles, productionFileIds: reviewFiles.map(file => file.id), libraryFileIds: reviewFiles.map(file => file.id) };
function ReviewPage() {
    const { production, soundScene, visualScene } = useSyncExternalStore(model.subscribe, model.snapshot);
    return <>
  <div role="note" style={{ padding: '10px 18px', background: '#fff2ca', color: '#483b12', fontSize: 13 }}>Historical Studio QA · original editing sessions with local, in-memory saves/history. WAVs are synthetic QA pulses/chords/clicks; image is a local geometric fixture. No generated voices, production persistence, uploads, transcription or backend exports. Refresh resets this sample. Use Timeline Play for composition playback.</div>
  <AudiovisualProductionPage production={production} project={null} soundScene={soundScene} visualScene={visualScene} {...resources} fileState={{ status: 'ready', data: resources }} config={null} directory={{ config: null, cloned: [], meta: {}, catalog: [] }} refresh={async () => { }} refreshFiles={async () => { }}/>
 </>;
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><TooltipProvider><ProductReadinessProvider><GlobalPlayerProvider>
 <ReviewPage />
 </GlobalPlayerProvider></ProductReadinessProvider></TooltipProvider></MemoryRouter>);
