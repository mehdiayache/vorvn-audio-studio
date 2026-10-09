const cache=new Map<string,{at:number;value:string|number[]}>();
let active=0;
const waiting: (()=>void)[]=[];
async function slot(signal:AbortSignal){
 signal.throwIfAborted();
 if(active<2)active++;
 else await new Promise<void>((resolve,reject)=>{const run=()=>{signal.removeEventListener('abort',abort);active++;resolve()};const abort=()=>{const i=waiting.indexOf(run);if(i>=0)waiting.splice(i,1);reject(new DOMException('Aborted','AbortError'))};waiting.push(run);signal.addEventListener('abort',abort,{once:true})});
 const release=()=>{active--;waiting.shift()?.()};
 if(signal.aborted){release();signal.throwIfAborted()}
 return release;
}
/** Reads at most the preview budget, even when a server ignores Range. */
export async function previewBytes(url:string,limit:number,signal:AbortSignal,complete=false){
 const response=await fetch(url,{signal,credentials:'same-origin',headers:complete?undefined:{Range:`bytes=0-${limit-1}`}});
 if(!response.ok)throw Error('Preview unavailable');
 if(complete&&Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('Preview too large')}
 const reader=response.body?.getReader();if(!reader)throw Error('Preview unavailable');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;const remaining=limit-size;if(complete&&value.length>remaining)throw Error('Preview too large');chunks.push(value.subarray(0,remaining));size+=Math.min(value.length,remaining);if(size>=limit){await reader.cancel();break}}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes;
}
const peakCount=512;
const maximumAudioBytes=128*1024*1024;
/** Merge all channels without phase cancellation, in bounded time buckets. */
export function addWaveformSamples(peaks:number[],samples:Float32Array,channels:number,sampleRate:number,timestamp:number,duration:number){
 for(let frame=0;frame<samples.length/channels;frame++){
  const at=timestamp+frame/sampleRate;if(at<0||at>=duration)continue;
  const bin=Math.min(peaks.length-1,Math.floor(at/duration*peaks.length));
  for(let channel=0;channel<channels;channel++){const value=Math.abs(samples[frame*channels+channel]!);if(Number.isFinite(value))peaks[bin]=Math.max(peaks[bin]!,value)}
 }
}
function normalizePeaks(peaks:number[]){const max=Math.max(...peaks);return max?peaks.map(value=>value/max):peaks}
/** Decode successive audio packets, not a full uncompressed AudioBuffer. */
async function streamedAudioPeaks(url:string,signal:AbortSignal){
 const {Input,UrlSource,ALL_FORMATS,AudioSampleSink}=await import('mediabunny');
 signal.throwIfAborted();let received=0;
 const source=new UrlSource(url,{maxCacheSize:2*1024*1024,parallelism:1,getRetryDelay:()=>null,requestInit:{credentials:'same-origin'},handleUnhandledError:()=>{},fetchFn:async(resource,options)=>{
  const response=await fetch(resource,{...options,signal:AbortSignal.any([signal,...(options?.signal?[options.signal]:[])])});
  const total=Number(response.headers.get('content-range')?.split('/')[1]??response.headers.get('content-length'));
  if(total>maximumAudioBytes){await response.body?.cancel();throw Error('Waveform exceeds preview budget')}
  if(!response.body)return response;
  const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){received+=chunk.length;if(received>maximumAudioBytes*2)throw Error('Waveform exceeds preview budget');controller.enqueue(chunk)}}));
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 }});
 const input=new Input({formats:ALL_FORMATS,source});
 const abort=()=>input.dispose();signal.addEventListener('abort',abort,{once:true});
 try{
  const track=await input.getPrimaryAudioTrack();if(!track)throw Error('Audio track unavailable');
  const duration=await track.computeDuration();
  if(!Number.isFinite(duration)||duration<=0||duration>7200)throw Error('Waveform exceeds preview budget');
  if(!await track.canDecode())throw Error('Waveform codec unavailable');
  const peaks=new Array<number>(peakCount).fill(0);
  for await(const sample of new AudioSampleSink(track).samples()){
   try{
    signal.throwIfAborted();const size=sample.allocationSize({format:'f32',planeIndex:0});
    if(size>4*1024*1024)throw Error('Waveform sample exceeds preview budget');
    const values=new Float32Array(size/4);sample.copyTo(values,{format:'f32',planeIndex:0});
    addWaveformSamples(peaks,values,sample.numberOfChannels,sample.sampleRate,sample.timestamp,duration);
   }finally{sample.close()}
  }
  signal.throwIfAborted();return normalizePeaks(peaks);
 }finally{signal.removeEventListener('abort',abort);input.dispose()}
}
async function audioPeaks(url:string,signal:AbortSignal){
 try{return await streamedAudioPeaks(url,signal)}catch(error){
  signal.throwIfAborted();
  // Older browsers may play a compressed format without WebCodecs support.
  // Retain a small, explicitly bounded compatibility path, never buffer large audio.
  if(error instanceof Error&&error.message.includes('preview budget'))throw error;
  const bytes=await previewBytes(url,8_000_000,signal,true),context=new AudioContext({sampleRate:8000});
  try{const buffer=await context.decodeAudioData(bytes.buffer);signal.throwIfAborted();
   const peaks=new Array<number>(peakCount).fill(0),channels=buffer.numberOfChannels;
   for(let channel=0;channel<channels;channel++){const samples=buffer.getChannelData(channel);addWaveformSamples(peaks,samples,1,buffer.sampleRate,0,buffer.duration)}
   return normalizePeaks(peaks);
  }finally{await context.close()}
 }
}
async function computePreviewData(url:string,kind:'text'|'audio',signal:AbortSignal,revisionKey=url):Promise<string|number[]>{
 signal=AbortSignal.any([signal,AbortSignal.timeout(kind==='audio'?60000:15000)]);
 const key=kind+':'+revisionKey,cached=cache.get(key);if(cached&&Date.now()-cached.at<60000)return cached.value;
 const release=await slot(signal);
 try{
 const value=kind==='text'?new TextDecoder().decode(await previewBytes(url,4096,signal)).slice(0,1600):await audioPeaks(url,signal);
 if(cache.size>=24)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),value});return value;
 }finally{release()}
}

const peakWork=new Map<string,{promise:Promise<string|number[]>;controller:AbortController;users:number}>();
const peakStorage='vevold:waveform-peaks:v2';
function storedPeaks(key:string):number[]|undefined{try{const entries=JSON.parse(localStorage.getItem(peakStorage)??'[]');const row=Array.isArray(entries)?entries.find(r=>r.key===key):undefined;return row&&Date.now()-row.at<7*86400000&&Array.isArray(row.peaks)&&row.peaks.length===peakCount&&row.peaks.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)?row.peaks:undefined}catch{return undefined}}
function savePeaks(key:string,peaks:number[]){if(key.includes('://')||key.startsWith('/'))return;try{const old=JSON.parse(localStorage.getItem(peakStorage)??'[]');const rows=Array.isArray(old)?old.filter(r=>r?.key!==key&&typeof r?.at==='number'&&Date.now()-r.at<7*86400000):[];localStorage.setItem(peakStorage,JSON.stringify([...rows,{key,at:Date.now(),peaks:peaks.map(v=>Math.round(v*10000)/10000)}].slice(-48)))}catch{}}
/** One bounded decode per immutable file revision; consumers share work and persisted peaks. */
export async function filePreviewData(url:string,kind:'text'|'audio',signal:AbortSignal,revisionKey=url):Promise<string|number[]>{
 signal.throwIfAborted();if(kind==='text')return computePreviewData(url,kind,signal,revisionKey);
 // The authorized media endpoint exposes byte identity even when a legacy file
 // has no metadata index. Resolve before looking in the device cache.
 if(revisionKey===url&&/^\/api\/files\/[^/?]+$/.test(url)){
  let head:Response|undefined;
  try{head=await fetch(url,{method:'HEAD',credentials:'same-origin',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])})}
  catch{signal.throwIfAborted();/* A transport failure leaves playback available, without persistent caching. */}
  if(head&&!head.ok)throw Error('Waveform source unavailable');
  const etag=head?.headers.get('etag');
  if(etag)revisionKey=`asset:${typeof location==='undefined'?'local':location.host}:${url}:${etag}`;
 }

 const saved=storedPeaks(revisionKey);if(saved)return saved;
 let pending=peakWork.get(revisionKey);
 if(!pending){
  const controller=new AbortController();
  const entry={controller,users:0,promise:Promise.resolve<string|number[]>([])};
  entry.promise=computePreviewData(url,kind,controller.signal,revisionKey).then(value=>{if(Array.isArray(value))savePeaks(revisionKey,value);return value}).finally(()=>{if(peakWork.get(revisionKey)===entry)peakWork.delete(revisionKey)});
  peakWork.set(revisionKey,entry);pending=entry;
 }
 const entry=pending;entry.users++;
 return new Promise((resolve,reject)=>{
  let finished=false;
  const finish=()=>{if(finished)return false;finished=true;signal.removeEventListener('abort',abort);entry.users--;if(!entry.users){entry.controller.abort();if(peakWork.get(revisionKey)===entry)peakWork.delete(revisionKey)}return true};
  const abort=()=>{if(finish())reject(signal.reason??new DOMException('Aborted','AbortError'))};
  signal.addEventListener('abort',abort,{once:true});
  entry.promise.then(value=>{if(finish())resolve(value)},error=>{if(finish())reject(error)});
  if(signal.aborted)abort();
 });
}
