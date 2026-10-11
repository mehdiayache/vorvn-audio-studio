import path from 'node:path';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
const runtime = '/Users/berberos/Documents/Codex/2026-09-12/vevold-foundation/outputs/vevold/node_modules';
export default defineConfig({ root: 'frontend', base: '/origins/', plugins: [react(), tailwindcss(), {
            name: 'isolated-legacy-waveform-compatibility',
            transform(code, id) { if ((id.includes('/features/') || id.includes('/hooks/')) && code.includes('@/components/audio-waveform'))
                return code.replaceAll('@/components/audio-waveform', '@/review/legacy-waveform-adapter'); },
            configureServer(server) {
                // The old native playout uses /audio filenames. Serve only named QA Files;
                // this isolated server has no legacy API/backend proxy.
                server.middlewares.use((request, response, next) => {
                    const filename = new URL(request.url || '/', 'http://qa.invalid').pathname.match(/^\/audio\/(review-qa-(?:opening|dialogue|music|effect)\.wav)$/)?.[1];
                    if (!filename)
                        return next();
                    if (request.method !== 'GET' && request.method !== 'HEAD') {
                        response.statusCode = 405;
                        response.end();
                        return;
                    }
                    const bytes = readFileSync(path.join(import.meta.dirname, 'frontend/public/review-media', filename));
                    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
                    let start = 0, end = bytes.length - 1;
                    if (range) {
                        start = Number(range[1]);
                        end = range[2] ? Math.min(end, Number(range[2])) : end;
                        if (start > end || start >= bytes.length) {
                            response.statusCode = 416;
                            response.setHeader('Content-Range', `bytes */${bytes.length}`);
                            response.end();
                            return;
                        }
                        response.statusCode = 206;
                        response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
                    }
                    response.setHeader('Content-Type', 'audio/wav');
                    response.setHeader('Accept-Ranges', 'bytes');
                    response.setHeader('Content-Length', end - start + 1);
                    response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
                });
            },
        }], resolve: { alias: [
            { find: '@arraypress/waveform-player/no-autoinit', replacement: path.join(runtime, '@arraypress/waveform-player/dist/waveform-player-no-autoinit.esm.js') },
            { find: '@arraypress/waveform-player/styles.css', replacement: path.join(runtime, '@arraypress/waveform-player/dist/waveform-player.css') },
            { find: 'mediabunny', replacement: path.join(runtime, 'mediabunny/dist/modules/src/index.js') },
            { find: '@', replacement: path.resolve(import.meta.dirname, 'frontend/src') },
        ] }, server: { host: '127.0.0.1', port: 5175, strictPort: true, fs: { allow: [import.meta.dirname, runtime] } } });
