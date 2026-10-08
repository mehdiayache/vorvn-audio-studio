import {useSurfaceContainer} from './ui/surface-scope';
import {createPortal} from 'react-dom';
import {ReferenceHover} from './reference-hover';
import {VideoThumbnail} from './ui/video-thumbnail';
import {useLayoutEffect,useRef,useState} from 'react';
import {insertMention,type MentionDocument,type MentionChoice} from '../lib/prompt-mentions';
export type VisualMentionChoice=MentionChoice&{thumbnail?:string;mediaKind?:string;details?:string};
function snapshot(value:MentionDocument):MentionDocument{return {prompt:value.prompt,promptMentions:value.promptMentions??[]}}
function signature(value:MentionDocument){return JSON.stringify([value.prompt,value.promptMentions??[]])}
function read(root:Node):MentionDocument{
 let prompt='';const promptMentions:NonNullable<MentionDocument['promptMentions']>=[];
 function visit(node:Node){
 if(node.nodeType===3){prompt+=node.textContent??'';return}
 if(!(node instanceof Element)){node.childNodes.forEach(visit);return}
 if(node.hasAttribute('data-mention-key')){const token=node.getAttribute('data-token')??'';promptMentions.push({key:node.getAttribute('data-mention-key')!,start:prompt.length,end:prompt.length+token.length});prompt+=token;return}
 if(node.tagName==='BR'){prompt+='\n';return}
 if(['DIV','P'].includes(node.tagName)&&prompt&&!prompt.endsWith('\n'))prompt+='\n';node.childNodes.forEach(visit);
 }
 root.childNodes.forEach(visit);return {prompt,promptMentions};
}
function offset(root:HTMLElement){const selection=window.getSelection();if(!selection?.rangeCount||!root.contains(selection.anchorNode))return null;const range=selection.getRangeAt(0).cloneRange();range.selectNodeContents(root);range.setEnd(selection.anchorNode!,selection.anchorOffset);return read(range.cloneContents()).prompt.length}
function caret(root:HTMLElement,position:number){
 let remaining=position;const range=document.createRange();
 for(const node of Array.from(root.childNodes)){
 const size=node instanceof HTMLElement&&node.dataset.token?node.dataset.token.length:node.textContent?.length??0;
 if(remaining<=size){if(node.nodeType===3)range.setStart(node,remaining);else if(remaining===0)range.setStartBefore(node);else range.setStartAfter(node);range.collapse(true);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);return}remaining-=size;
 }range.selectNodeContents(root);range.collapse(false);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
}
export function RichReferenceInput({value,onChange,choices,label,placeholder,maxLength,hint,disabled=false,surface='field'}:{value:MentionDocument;onChange:(value:MentionDocument)=>void;choices:VisualMentionChoice[];label:string;placeholder?:string;maxLength:number;hint:string;disabled?:boolean;surface?:'field'|'composer'}){
 const container=useSurfaceContainer();
 const root=useRef<HTMLDivElement>(null),composing=useRef(false),pending=useRef<number|null>(null);
 const history=useRef<MentionDocument[]>([snapshot(value)]),historyIndex=useRef(0);
 function change(next:MentionDocument){history.current=history.current.slice(0,historyIndex.current+1);history.current.push(next);if(history.current.length>100)history.current.shift();historyIndex.current=history.current.length-1;onChange(next)}
 function undo(redo=false){const index=historyIndex.current+(redo?1:-1);if(index<0||index>=history.current.length)return;const previous=history.current[index];if(!previous)return;historyIndex.current=index;pending.current=previous.prompt.length;onChange(previous);setQuery(null)}
 const [revision,setRevision]=useState(0);
 const [query,setQuery]=useState<{start:number;end:number;text:string}|null>(null),[active,setActive]=useState(0);
 const menu=useRef<HTMLDivElement>(null);
 const [placement,setPlacement]=useState({left:0,top:0,width:240,maxHeight:192});
 useLayoutEffect(()=>{if(!query||!root.current)return;
  const place=()=>{const rect=root.current!.getBoundingClientRect();const below=window.innerHeight-rect.bottom-12,above=rect.top-12;const height=Math.min(192,Math.max(below,above));const top=below>=192||below>=above?rect.bottom+4:Math.max(8,rect.top-height-4);setPlacement({left:Math.max(8,Math.min(rect.left,window.innerWidth-rect.width-8)),top,width:Math.min(rect.width,window.innerWidth-16),maxHeight:height})};
  const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setQuery(null)};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('pointerdown',dismiss);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',dismiss)};
 },[query]);
 function replaceTag(chip:Element){const key=chip.getAttribute('data-mention-key');const token=chip.getAttribute('data-token');const mentions=value.promptMentions??[];const chips=Array.from(root.current?.querySelectorAll('[data-mention-key]')??[]);const mention=mentions[chips.indexOf(chip)];if(mention&&key&&token){setQuery({start:mention.start,end:mention.end,text:''});setActive(Math.max(0,choices.findIndex(c=>c.key===key)))}}
 const options=query?choices.filter(c=>c.label.toLowerCase().includes(query.text.toLowerCase())):[];
 useLayoutEffect(()=>{
 if(signature(history.current[historyIndex.current]??value)!==signature(value)){history.current=[snapshot(value)];historyIndex.current=0;}
 const el=root.current;if(!el||composing.current)return;
 const serialized=read(el);if(serialized.prompt===value.prompt&&JSON.stringify(serialized.promptMentions)===JSON.stringify(value.promptMentions??[])&&el.dataset.visual===JSON.stringify(choices))return;
 const position=pending.current??offset(el);el.replaceChildren();let cursor=0;
 for(const mention of value.promptMentions??[]){
 el.appendChild(document.createTextNode(value.prompt.slice(cursor,mention.start)));
 const chip=document.createElement('span');chip.className='reference-tag';chip.contentEditable='false';chip.tabIndex=0;chip.setAttribute('role','button');chip.dataset.mentionKey=mention.key;chip.dataset.token=value.prompt.slice(mention.start,mention.end);
 const choice=choices.find(c=>c.key===mention.key);
 if(choice?.thumbnail){const media=document.createElement(choice.mediaKind==='video'?'video':'img');media.className='reference-tag-media';media.setAttribute('src',choice.thumbnail);media.setAttribute('aria-hidden','true');if(media instanceof HTMLVideoElement){media.muted=true;media.preload='metadata'}chip.appendChild(media)}
 if(!choice)chip.dataset.invalid='true';chip.appendChild(document.createTextNode(chip.dataset.token));el.appendChild(chip);cursor=mention.end;
 }el.appendChild(document.createTextNode(value.prompt.slice(cursor)));el.dataset.visual=JSON.stringify(choices);
 if(position!==null){caret(el,position);pending.current=null}
 },[value,choices,revision]);
 function update(){const el=root.current;if(!el||composing.current||disabled)return;const next=read(el);if([...next.prompt].length>maxLength){setRevision(i=>i+1);return;}change(next);const end=offset(el);const match=end===null?null:/(?:^|\s)@([\p{L}\d]*)$/u.exec(next.prompt.slice(0,end));setQuery(match?{start:end!-(match[1]?.length??0)-1,end:end!,text:match[1]??''}:null);setActive(0)}
 function insert(choice:VisualMentionChoice){if(!query)return;const next=insertMention(value,choice,query.start,query.end);if([...next.prompt].length>maxLength)return;pending.current=query.start+choice.label.length+2;change(next);setQuery(null);root.current?.focus()}
 function pasteText(text:string){const el=root.current,selection=window.getSelection();if(!el||!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);update()}
 return <><div ref={root} className="reference-rich-input" data-slot={surface==='composer'?'input-group-control':undefined} contentEditable={!disabled} aria-disabled={disabled} role="textbox" aria-label={label} aria-multiline="true" data-placeholder={placeholder} suppressContentEditableWarning onClick={e=>{const chip=(e.target as Element).closest('[data-mention-key]');if(chip)replaceTag(chip)}} onInput={update} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false;update()}} onBlur={()=>setQuery(null)} onPaste={e=>{e.preventDefault();pasteText(e.clipboardData.getData('text/plain'))}} onKeyDown={e=>{
 if(e.nativeEvent.isComposing||disabled)return;
 const chip=(e.target as Element).closest('[data-mention-key]');if(chip&&['Enter',' '].includes(e.key)){e.preventDefault();replaceTag(chip);return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return}
 if((e.metaKey||e.ctrlKey)&&['b','i','u'].includes(e.key.toLowerCase())){e.preventDefault();return}
 if(query&&e.key==='Escape'){e.preventDefault();setQuery(null);return}
 if(query&&options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);return}
 if(e.key==='Enter'){e.preventDefault();if(query&&options.length)insert((options[active]??options[0])!);else pasteText('\n')}
 }}/>{query&&options.length>0&&createPortal(<div ref={menu} className="reference-prompt-options reference-prompt-menu dialog-scroll-region" style={placement} role="group" aria-label={hint} onMouseDown={e=>e.preventDefault()}>{options.map((choice,i)=><ReferenceHover details={choice.details} key={choice.key} label={'@'+choice.label} preview={choice.thumbnail?(choice.mediaKind==='video'?<VideoThumbnail url={choice.thumbnail} onError={()=>{}}/>:<img src={choice.thumbnail} alt=""/>):null}><button type="button" className="reference-prompt-option" data-active={i===active} onClick={()=>insert(choice)}>{choice.thumbnail&&(choice.mediaKind==='video'?<video className="reference-tag-media" muted preload="metadata" src={choice.thumbnail}/>:<img className="reference-tag-media" alt="" src={choice.thumbnail}/>)}<span>@{choice.label}</span></button></ReferenceHover>)}</div>,container??document.body)}</>;
}
