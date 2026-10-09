import {createContext,useContext,useEffect,useRef,useState} from 'react';
export type ThumbnailResult={state:'ready';blob:Blob}|{state:'pending';retryAfter:number}|{state:'unavailable'}|{state:'original'};
export type ThumbnailResolver=(url:string,size:320|640,signal:AbortSignal)=>Promise<ThumbnailResult>;
/** Host-supplied private derivative service. Prototype/external sources retain normal previews. */
export const ThumbnailSourceContext=createContext<ThumbnailResolver|null>(null);
export function useThumbnailSource(url:string|undefined,enabled:boolean,compact:boolean,settle:()=>void){
 const resolver=useContext(ThumbnailSourceContext),settled=useRef(settle);settled.current=settle;
 const [result,setResult]=useState<{state:'pending'|'ready'|'unavailable'|'original';url?:string}>({state:resolver?'pending':'original'});
 const cached=useRef<{key:string;url:string}|undefined>(undefined);const key=JSON.stringify([url,compact]);
 useEffect(()=>()=>{if(cached.current){URL.revokeObjectURL(cached.current.url);cached.current=undefined}},[key,resolver]);
 useEffect(()=>{
  if(!enabled||!url||!resolver)return;
  if(cached.current?.key===key){setResult({state:'ready',url:cached.current.url});settled.current();return;}
  setResult({state:'pending'});
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,attempt=0;
  const deadline=setTimeout(()=>{controller.abort();clearTimeout(timer);setResult({state:'unavailable'});settled.current()},40000);
  const size:320|640=compact?320:640;
  const complete=()=>{clearTimeout(deadline);settled.current()};
  const poll=async()=>{
   try{
    const next=await resolver(url,size,controller.signal);if(controller.signal.aborted)return;
    if(next.state==='ready'){const objectUrl=URL.createObjectURL(next.blob);cached.current={key,url:objectUrl};setResult({state:'ready',url:objectUrl});complete();return;}
    if(next.state==='pending'){
     attempt++;
     if(attempt<4){timer=setTimeout(()=>void poll(),Math.min(12000,Math.max(2000,next.retryAfter*1000)*2**(attempt-1)));return;}
     // Release foreground admission and show the format fallback while durable work continues.
     // A bounded slow follow-up lets a late poster paint without reloading the whole folder.
     setResult({state:'unavailable'});complete();
     if(attempt<20)timer=setTimeout(()=>void poll(),Math.min(120000,30000*2**(attempt-4)));
     return;
    }
    setResult({state:next.state==='original'?'original':'unavailable'});complete();
   }catch{if(!controller.signal.aborted){
    if(++attempt<4){timer=setTimeout(()=>void poll(),Math.min(12000,2000*2**(attempt-1)));return}
    complete();setResult({state:'unavailable'});
   }}
  };
  void poll();return()=>{controller.abort();clearTimeout(timer);clearTimeout(deadline);};
 },[url,enabled,resolver,compact,key]);
 return resolver?result:{state:'original' as const};
}
