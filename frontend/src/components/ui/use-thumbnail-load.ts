import {useEffect,useRef,useState} from 'react';
// Admission covers one bounded derivative attempt, not only its first pending reply.
const pending=new Set<()=>void>();let running=0;
function drain(){while(running<6&&pending.size){const next=pending.values().next().value!;pending.delete(next);next()}}
export function useThumbnailLoad(enabled:boolean){
 const ref=useRef<HTMLSpanElement>(null),finish=useRef<()=>void>(()=>{});
 const [started,setStarted]=useState(false),[timedOut,setTimedOut]=useState(false);
 useEffect(()=>{
  if(!enabled)return;let active=false,closed=false,visible=false,timer:ReturnType<typeof setTimeout>|undefined;
  const settle=()=>{clearTimeout(timer);if(active){active=false;running--;drain()}};
  finish.current=settle;
  const start=()=>{if(closed||!visible)return;active=true;running++;setStarted(true);timer=setTimeout(()=>{setTimedOut(true);settle()},45000)};
  const visibility=(next:boolean)=>{if(visible===next)return;visible=next;if(next){setTimedOut(false);pending.add(start);drain()}else{pending.delete(start);setStarted(false);settle()}};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>visibility(entries.some(entry=>entry.isIntersecting)),{rootMargin:'320px'});
  if(observer&&ref.current)observer.observe(ref.current);else visibility(true);
  return()=>{closed=true;observer?.disconnect();pending.delete(start);settle()};
 },[enabled]);
 return {ref,started:enabled&&started,timedOut,settle:()=>{setTimedOut(false);finish.current()}};
}
