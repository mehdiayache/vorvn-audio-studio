import {useLayoutEffect,useRef,useState,type MouseEvent,type ReactNode} from 'react';
import {Folder,TriangleAlert,Check} from 'lucide-react';
import {FileName} from './file-identity';
import './folder-preview-card.css';
export type FolderActivity={active:number;attention:number;unseen:number;label:string};
/** A browsable folder summary; management actions are supplied only by its owner. */
export function FolderPreviewCard({disabled=false,selected,name,count,previews,onOpen,actions,managed,icon,density='comfortable',countLabel,openLabel,activity}:{disabled?:boolean;selected?:boolean;openLabel?:string;name:string;count:number;previews:ReactNode[];onOpen:(event:MouseEvent<HTMLButtonElement>)=>void;actions?:ReactNode;managed?:string;icon?:ReactNode;density?:'comfortable'|'compact'|'system';countLabel?:string;activity?:FolderActivity}){
 return <article className="folder-preview-card" data-density={density} data-selected={selected}><div className="folder-preview-card__body"><span className="folder-preview-card__symbol"><FolderFormatIcon icon={icon} activity={activity}/></span><button className="folder-preview-card__open" disabled={disabled} onClick={onOpen} aria-pressed={selected} aria-label={openLabel??`Open folder: ${name}`} aria-description={[managed?`Managed in ${managed}`:undefined,activity?.label].filter(Boolean).join(' · ')||undefined} title={[name,activity?.label].filter(Boolean).join(' · ')}>{density==='comfortable'&&<span className="folder-preview-card__samples">{previews.length?previews.slice(0,3).map((preview,i)=><span key={i}>{preview}</span>):<span className="folder-preview-card__empty"><Folder size={28}/></span>}</span>}</button></div><button className="folder-preview-card__caption" disabled={disabled} onClick={onOpen} title={[name,activity?.label].filter(Boolean).join(' · ')}><FileName name={name}/><span className="folder-preview-card__metadata">{countLabel??`${count} ${count===1?'file':'files'}`}</span></button>{actions&&<div className="folder-preview-card__actions">{actions}</div>}</article>
}

/** Draw in CSS pixels: card height must never stretch corners or the folder tab. */
export function FolderSilhouette(){
 const ref=useRef<SVGSVGElement>(null);
 const [size,setSize]=useState({width:240,height:180,radius:16,step:24});
 useLayoutEffect(()=>{
  const element=ref.current;
  if(!element)return;
  const update=()=>{
   // Layout dimensions stay stable inside zoomed or transformed surfaces.
   const {clientWidth:width,clientHeight:height}=element;
   if(!width||!height)return;
   const style=getComputedStyle(element);
   const radius=parseFloat(style.getPropertyValue('--folder-corner-radius')),step=parseFloat(style.getPropertyValue('--folder-tab-height'));
   setSize({width,height,radius:Number.isFinite(radius)?radius:16,step:Number.isFinite(step)?step:24});
  };
  update();
  const observer=new ResizeObserver(update);observer.observe(element);
  const appearance=new MutationObserver(update);appearance.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-ui-radius']});
  return ()=>{observer.disconnect();appearance.disconnect()};
 },[]);
 const {width:w,height:h,step:t}=size;
 const r=Math.min(size.radius,w*.08,h*.14);
 const shoulder=Math.min(w*.64,w-r-32);
 return <svg ref={ref} className="folder-preview-card__silhouette" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
  <rect className="folder-preview-card__back" x="6" y="8" width={Math.max(0,w-12)} height={Math.max(0,h-16)} rx={r}/>
  <path className="folder-preview-card__front" vectorEffect="non-scaling-stroke" d={`M${r} ${t} H${shoulder-8} Q${shoulder} ${t} ${shoulder+4} ${t-7} L${shoulder+12} 7 Q${shoulder+16} 0 ${shoulder+24} 0 H${w-r} Q${w} 0 ${w} ${r} V${h-r} Q${w} ${h} ${w-r} ${h} H${r} Q0 ${h} 0 ${h-r} V${t+r} Q0 ${t} ${r} ${t} Z`}/>
 </svg>;
}

/** Folder anatomy adapted from shunyadezain's CSS Folder Hover Micro Interaction. */
export function FolderFormatIcon({compact=false,navigation=false,activity}:{compact?:boolean;navigation?:boolean;icon?:ReactNode;activity?:FolderActivity}){
 return <span className="interactive-folder" data-compact={compact} data-navigation={navigation} data-working={!!activity?.active} data-attention={!!activity?.attention} role={activity?'img':undefined} aria-label={activity?.label} aria-hidden={activity?undefined:true} title={activity?.label}><span className="interactive-folder__back"><span className="interactive-folder__paper"/><span className="interactive-folder__paper"/><span className="interactive-folder__paper"/><span className="interactive-folder__front"/><span className="interactive-folder__front interactive-folder__front--right"/>{activity&&<span className="interactive-folder__status">{activity.attention>0?<TriangleAlert/>:activity.active>0?<span className="interactive-folder__working-lines"><i/><i/><i/></span>:<Check/>}{!navigation&&<span>{activity.attention||activity.active||activity.unseen}</span>}</span>}</span></span>;
}
