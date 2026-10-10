import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';
const runtime = '/Users/berberos/Documents/Codex/2026-09-12/vevold-foundation/outputs/vevold/node_modules';
export default defineConfig({root:'frontend',base:'/origins/',plugins:[react(),tailwindcss(),{
 name:'isolated-legacy-waveform-compatibility',
 transform(code,id){if(id.includes('/features/') && code.includes('useAudioPeaks'))return code.replaceAll('@/components/audio-waveform','@/review/legacy-waveform-adapter');},
}],resolve:{alias:[
 {find:'@arraypress/waveform-player/no-autoinit',replacement:path.join(runtime,'@arraypress/waveform-player/dist/waveform-player-no-autoinit.esm.js')},
 {find:'@arraypress/waveform-player/styles.css',replacement:path.join(runtime,'@arraypress/waveform-player/dist/waveform-player.css')},
 {find:'mediabunny',replacement:path.join(runtime,'mediabunny/dist/modules/src/index.js')},
 {find:'@',replacement:path.resolve(import.meta.dirname,'frontend/src')},
]},server:{host:'127.0.0.1',port:5175,strictPort:true,fs:{allow:[import.meta.dirname,runtime]}}});
