import {CharacterCount} from './character-count';
import {RichReferenceInput,type VisualMentionChoice} from './rich-reference-input';
import {useRef,useState} from 'react';
import {Textarea} from './ui/textarea';
import {ReferenceTag} from './reference-tag';
import {editMentionText,insertMention,type MentionDocument,type MentionChoice} from '../lib/prompt-mentions';
import './reference-prompt.css';

/** Structured identities remain plain-text compatible; media mentions include their thumbnail. */
export function ReferencePrompt({value,onChange,choices=[],label,name,placeholder,maxLength=100000,rows=5,hint='',missingLabel='',disabled=false,surface='field'}:{
 value:MentionDocument;onChange:(value:MentionDocument)=>void;choices?:VisualMentionChoice[];
 label:string;name:string;placeholder?:string;maxLength?:number;rows?:number;hint?:string;missingLabel?:string;disabled?:boolean;surface?:'field'|'composer';
}){
 const field=useRef<HTMLTextAreaElement>(null);
 const [query,setQuery]=useState<{start:number;end:number;text:string}|null>(null);
 const [selected,setSelected]=useState(0);
 const options=query?choices.filter(c=>c.label.toLowerCase().replaceAll(' ','').includes(query.text.toLowerCase().replaceAll(' ',''))):[];
 function readQuery(){
  const el=field.current;if(!el||el.selectionStart!==el.selectionEnd){setQuery(null);return;}
  const before=el.value.slice(0,el.selectionStart),match=/(?:^|\s)@([\p{L}\d]*)$/u.exec(before);
  setQuery(match?{start:el.selectionStart-(match[1]??'').length-1,end:el.selectionStart,text:match[1]??''}:null);setSelected(0);
 }
 function insert(choice:MentionChoice){
  const start=query?.start??field.current?.selectionStart??value.prompt.length;
  const end=query?.end??field.current?.selectionEnd??start;
  const next=insertMention(value,choice,start,end);if([...next.prompt].length>maxLength)return;
  onChange(next);setQuery(null);
  requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(start+choice.label.length+2,start+choice.label.length+2)});
 }
 const missing=(value.promptMentions??[]).filter(m=>!choices.some(c=>c.key===m.key));
 return <div className="reference-prompt" data-surface={surface}>
  <>{choices.some(c=>c.thumbnail)?<RichReferenceInput surface={surface} value={value} onChange={onChange} choices={choices} label={label} placeholder={placeholder} maxLength={maxLength} hint={hint} disabled={disabled}/>:<label className="dp-field"><span className="sr-only">{label}</span><Textarea data-slot={surface==='composer'?'input-group-control':'textarea'} ref={field} disabled={disabled} name={name} rows={rows} placeholder={placeholder} aria-describedby={name+'-count'} aria-invalid={[...value.prompt].length>maxLength||undefined} value={value.prompt}
   onChange={e=>{onChange(editMentionText(value,e.target.value));readQuery()}}
   onSelect={readQuery} onBlur={()=>setQuery(null)}
   onKeyDown={e=>{
    if(e.nativeEvent.isComposing||!query)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setQuery(null)}
    if(options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length)}
    if(options.length&&e.key==='Enter'){const choice=options[selected]??options[0];if(choice){e.preventDefault();insert(choice)}}
   }}/></label>}</>
  <CharacterCount id={name+'-count'} value={value.prompt} max={maxLength}/>
  {query&&options.length>0&&<div className="reference-prompt-options dialog-scroll-region" role="group" aria-label={hint} onMouseDown={e=>e.preventDefault()}>
   {options.map((choice,index)=><button type="button" key={choice.key} className="reference-prompt-option" data-active={index===selected} onClick={()=>insert(choice)}><ReferenceTag>@{choice.label}</ReferenceTag></button>)}
  </div>}
  {choices.length>0&&<div className="reference-prompt-hint">{hint}</div>}
  {missing.length>0&&<div role="alert" className="reference-prompt-missing">{missingLabel} {missing.map((m,i)=><ReferenceTag key={i} invalid>{value.prompt.slice(m.start,m.end)}</ReferenceTag>)}</div>}
 </div>;
}
