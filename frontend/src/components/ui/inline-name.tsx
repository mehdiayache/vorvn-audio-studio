import {useRef,useState,useId} from 'react';
import {Pencil} from 'lucide-react';
import {Input} from './input';
import './inline-name.css';
/** Shared inline metadata editor. Persistence and domain validation belong to the caller. */
export function InlineName({value,label,disabled,onSave,suffix='',validate,maxLength=80,error:externalError,placeholder='',allowEmpty=false,initialEditing=false}:{initialEditing?:boolean;value:string;label:string;disabled?:boolean;onSave:(name:string)=>Promise<boolean>;suffix?:string;validate?:(value:string)=>string|undefined;maxLength?:number;error?:string;placeholder?:string;allowEmpty?:boolean}){
 const [editing,setEditing]=useState(initialEditing&&!disabled),[draft,setDraft]=useState(value),[pending,setPending]=useState(false),[issue,setIssue]=useState<string>();
 const cancelled=useRef(false),submitting=useRef(false),errorId=useId();
 async function commit(){if(cancelled.current||submitting.current)return;const name=validate?draft:draft.trim();const problem=validate?.(name);setIssue(problem);if(problem||(!allowEmpty&&!name))return;if(name===value){setEditing(false);return}submitting.current=true;setPending(true);try{if(await onSave(name))setEditing(false)}finally{submitting.current=false;setPending(false)}}
 if(!editing)return <button type="button" className="fd-inline-name" data-resource-name={value+suffix} disabled={disabled} aria-label={`${label}: ${value}${suffix}`} onClick={()=>{cancelled.current=false;setIssue(undefined);setDraft(value);setEditing(true)}}><span>{value||placeholder}{suffix}</span><Pencil size={13} aria-hidden="true"/></button>;
 const error=issue||externalError;
 return <div className="fd-inline-name-editor" data-resource-name={value+suffix}><div className="inline-name-field"><Input data-escape-scope="editor" autoFocus aria-label={label} aria-invalid={!!error||(!allowEmpty&&!draft.trim())} aria-describedby={error?errorId:undefined} maxLength={maxLength} value={draft} disabled={pending} onFocus={e=>e.target.select()} onChange={e=>{setDraft(e.target.value);setIssue(undefined)}} onBlur={()=>void commit()} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelled.current=true;setEditing(false)}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();void commit()}}}/>{suffix&&<span className="inline-name-extension">{suffix}</span>}</div>{error&&<span id={errorId} className="inline-name-error" role="alert">{error}</span>}</div>;
}
