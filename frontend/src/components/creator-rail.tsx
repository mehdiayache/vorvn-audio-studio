import type {ReactNode} from 'react';
import {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider} from './ui/tooltip';
import './creator-rail.css';
import {CircleShortcut} from './ui/circle-shortcut';
/** Shared capability shortcuts in the panel header, with keyboard-readable previews. */
export function CreatorRail<T extends string>({label,value,options,onChange,disabled=false,showLabels=false}:{label:string;value?:T;options:readonly {value:T;label:string;icon:ReactNode;description?:string;image?:string}[];onChange:(value:T)=>void;disabled?:boolean;showLabels?:boolean}){
 return <TooltipProvider delayDuration={350}><nav className="creator-rail" data-labels={showLabels} aria-label={label}>{options.map(option=><Tooltip key={option.value}><TooltipTrigger asChild><CircleShortcut iconOnly={!showLabels} icon={option.icon} label={option.label} aria-pressed={value===option.value} disabled={disabled} onClick={()=>{if(value!==option.value)onChange(option.value)}}/></TooltipTrigger><TooltipContent side="bottom" sideOffset={10} className="creator-capability-preview">{option.image&&<img src={option.image} alt="" width={256} height={144} loading="lazy"/>}<span className="creator-capability-title">{option.label}</span>{option.description&&<span className="creator-capability-description">{option.description}</span>}</TooltipContent></Tooltip>)}</nav></TooltipProvider>;
}
