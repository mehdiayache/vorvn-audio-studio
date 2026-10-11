import {useEffect,useRef,useState} from "react"
import {Input} from "../ui/input"
import {FeedbackMessage} from "../ui/feedback-message"
import "./studio-timing-editor.css"
export type StudioTimingField={key:string;label:string;seconds:number;minimum?:number;maximum?:number;disabled?:boolean}
/** Precise editing complements the original timeline gestures. Local typing is
 * committed once on Enter/blur; Escape and navigation discard the local draft. */
export function StudioTimingEditor({fields,disabled=false,onCommit,invalidLabel}:{fields:StudioTimingField[];disabled?:boolean;onCommit:(key:string,seconds:number)=>void;invalidLabel:string}){
 return <div className="studio-timing-editor">{fields.map(field=><TimingField key={field.key} field={field} disabled={disabled||!!field.disabled} onCommit={onCommit} invalidLabel={invalidLabel}/>)}</div>
}
function TimingField({field,disabled,onCommit,invalidLabel}:{field:StudioTimingField;disabled:boolean;onCommit:(key:string,seconds:number)=>void;invalidLabel:string}){
 const [value,setValue]=useState(String(field.seconds)),[invalid,setInvalid]=useState(false),dirty=useRef(false);
 useEffect(()=>{dirty.current=false;setInvalid(false);setValue(String(field.seconds))},[field.seconds,disabled]);
 const cancel=()=>{dirty.current=false;setInvalid(false);setValue(String(field.seconds))};
 const cancelRef=useRef(cancel);cancelRef.current=cancel;
 useEffect(()=>{const blur=()=>cancelRef.current();window.addEventListener("blur",blur);return()=>window.removeEventListener("blur",blur)},[]);
 const commit=()=>{if(!dirty.current||disabled)return;dirty.current=false;const seconds=Number(value);if(!value.trim()||!Number.isFinite(seconds)||seconds<(field.minimum??0)||field.maximum!==undefined&&seconds>field.maximum){setInvalid(true);setValue(String(field.seconds));return}setInvalid(false);if(seconds!==field.seconds)onCommit(field.key,seconds)};
 return <label><span>{field.label}</span><Input type="number" aria-label={field.label} min={field.minimum??0} max={field.maximum} step={.001} value={value} disabled={disabled} aria-invalid={invalid||undefined} onChange={event=>{dirty.current=true;setInvalid(false);setValue(event.target.value)}} onBlur={commit} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();event.currentTarget.blur()}else if(event.key==="Enter"){event.preventDefault();commit();event.currentTarget.blur()}}}/>{invalid&&<FeedbackMessage tone="error" announce>{invalidLabel}</FeedbackMessage>}</label>
}
