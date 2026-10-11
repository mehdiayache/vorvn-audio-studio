import {GripVertical} from 'lucide-react'
import type {HTMLAttributes,ReactNode} from 'react'
import {cn} from '@/lib/utils'
import './studio-script.css'
export type StudioScriptDragHandleProps=HTMLAttributes<HTMLElement>&{draggable?:boolean}
export function StudioScriptDragHandle({number,label,compact=false,dragHandleProps}:{number:string;label?:string;compact?:boolean;dragHandleProps?:StudioScriptDragHandleProps}){
 return <button type="button" className={cn('ws-part-index',compact&&'is-compact')} aria-label={label??`Drag Part ${number} to reorder`} {...dragHandleProps}>{!compact&&<span>{number}</span>}<GripVertical aria-hidden="true"/></button>
}
/** The original full Studio card. Hosts supply authorized identity, operation and media slots. */
export function StudioScriptCard({id,number,selected=false,skipped=false,draft=false,issue=false,kind='speech',dragLabel,dragHandleProps,onSelect,identity,actions,text,textDirection,operation,footer,children,className}:{
 id:string;number:string;selected?:boolean;skipped?:boolean;draft?:boolean;issue?:boolean;kind?:'speech'|'file';dragLabel?:string;dragHandleProps?:StudioScriptDragHandleProps;onSelect:()=>void;identity:ReactNode;actions?:ReactNode;text?:ReactNode;textDirection?:'rtl'|'ltr';operation?:ReactNode;footer?:ReactNode;children?:ReactNode;className?:string
}){
 return <article id={id} className={cn('ws-part-card',kind==='file'&&'ws-file-card',selected&&'is-selected',skipped&&'is-disabled',draft&&'is-draft',issue&&'has-issue',className)} data-studio-script-card data-selected={selected||undefined} tabIndex={0} aria-label={`Part ${number}`} onClick={event=>{if((event.target as Element).closest('button,input,textarea,select,a,[role=checkbox],[role=menuitem]'))return;onSelect()}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect()}}}>
  <StudioScriptDragHandle number={number} label={dragLabel} dragHandleProps={dragHandleProps}/>
  <div className={cn('ws-part-main',kind==='file'&&'ws-file-main')}>
   <header className="ws-part-identity">{identity}<div className="ws-part-actions" onClick={event=>event.stopPropagation()}>{actions}</div></header>
   {text!==undefined&&<p className="ws-part-script" dir={textDirection}>{text}</p>}{operation}
   {footer&&<footer className={cn('ws-part-footer',kind==='file'&&'ws-file-footer')} onClick={event=>{if((event.target as Element).closest('button,input,a'))event.stopPropagation()}}>{footer}</footer>}
   {children}
  </div>
 </article>
}
export function StudioScriptPauseCard({id,number,selected,skipped,dragLabel,dragHandleProps,onSelect,children,actions}:{id:string;number:string;selected:boolean;skipped:boolean;dragLabel?:string;dragHandleProps?:StudioScriptDragHandleProps;onSelect:()=>void;children:ReactNode;actions?:ReactNode}){
 return <article id={id} className={cn('ws-silence-card',selected&&'is-selected',skipped&&'is-disabled')} data-studio-script-card data-selected={selected||undefined} tabIndex={0} aria-label={`Part ${number}`} onClick={event=>{if(!(event.target as Element).closest('button,input,[role=checkbox]'))onSelect()}} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onSelect()}}}><StudioScriptDragHandle number={number} label={dragLabel} dragHandleProps={dragHandleProps} compact/><span className="ws-silence-line"/><div onClick={event=>event.stopPropagation()}>{children}</div><span className="ws-part-actions" onClick={event=>event.stopPropagation()}>{actions}</span><span className="ws-silence-line"/></article>
}
