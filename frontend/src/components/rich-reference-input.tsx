import {Popover as PopoverPrimitive} from 'radix-ui';
import {Popover,PopoverContent} from './ui/popover';
import type {ReactElement,ReactNode,RefObject} from 'react';
import {ReferenceHover} from './reference-hover';
import {VideoThumbnail} from './ui/video-thumbnail';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {insertMention,type MentionDocument,type MentionChoice} from '../lib/prompt-mentions';
/** Native textarea and rich editors expose one viewport-space caret anchor to the popup engine. */
export function referenceCaretRect(element:HTMLElement):DOMRect{
 const bounds=element.getBoundingClientRect();
 if(element instanceof HTMLTextAreaElement){
  const style=getComputedStyle(element),mirror=document.createElement('div'),marker=document.createElement('span');
  for(const property of ['box-sizing','font-family','font-size','font-weight','font-style','letter-spacing','line-height','text-transform','text-align','text-indent','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','direction','tab-size'])mirror.style.setProperty(property,style.getPropertyValue(property));
  Object.assign(mirror.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',left:bounds.left+'px',top:bounds.top+'px',width:bounds.width+'px',height:'auto',whiteSpace:'pre-wrap',overflowWrap:'break-word'});
  mirror.appendChild(document.createTextNode(element.value.slice(0,element.selectionStart)));marker.textContent='\u200b';mirror.appendChild(marker);document.body.appendChild(mirror);
  const rect=marker.getBoundingClientRect(),height=rect.height||parseFloat(style.lineHeight)||parseFloat(style.fontSize)||16;mirror.remove();
  return new DOMRect(Math.max(bounds.left,Math.min(rect.left-element.scrollLeft,bounds.right)),Math.max(bounds.top,Math.min(rect.top-element.scrollTop,bounds.bottom-height)),1,height);
 }
 const selection=window.getSelection();if(selection?.rangeCount&&element.contains(selection.anchorNode)){const range=selection.getRangeAt(0).cloneRange();range.collapse(false);if(typeof range.getBoundingClientRect==='function'){const rect=range.getBoundingClientRect();if(rect.height)return rect;}}
 return new DOMRect(bounds.left,bounds.top,1,Math.min(bounds.height,20));
}
/** Suggestions share the host's portal/layer and collision rules while focus stays in the editor. */
export function ReferenceSuggestionPopover({anchor,inputRef,getAnchorRect,open,onOpenChange,label,children}:{anchor:ReactElement;inputRef:RefObject<HTMLElement|null>;getAnchorRect?:()=>DOMRect;open:boolean;onOpenChange:(open:boolean)=>void;label:string;children:ReactNode}){
 const [,reposition]=useState(0);
 useEffect(()=>{const element=inputRef.current;if(!open||!element)return;const scroll=()=>reposition(value=>value+1);element.addEventListener('scroll',scroll,{passive:true});return()=>element.removeEventListener('scroll',scroll)},[open,inputRef]);
 const virtualRef={current:{contextElement:inputRef.current??undefined,getBoundingClientRect:()=>getAnchorRect?.()??(inputRef.current?referenceCaretRect(inputRef.current):new DOMRect())}};
 return <Popover open={open} onOpenChange={onOpenChange} modal={false}>{anchor}<PopoverPrimitive.Anchor virtualRef={virtualRef}/><PopoverContent className="reference-prompt-options reference-prompt-menu dialog-scroll-region" side="top" align="start" sideOffset={8} collisionPadding={12} sticky="always" aria-label={label} role="group" onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onFocusOutside={event=>event.preventDefault()} onMouseDown={event=>event.preventDefault()}>{children}</PopoverContent></Popover>;
}
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
 const tagAnchor=useRef<Element|null>(null);
 const root=useRef<HTMLDivElement>(null),composing=useRef(false),pending=useRef<number|null>(null);
 const history=useRef<MentionDocument[]>([snapshot(value)]),historyIndex=useRef(0);
 function change(next:MentionDocument){history.current=history.current.slice(0,historyIndex.current+1);history.current.push(next);if(history.current.length>100)history.current.shift();historyIndex.current=history.current.length-1;onChange(next)}
 function undo(redo=false){const index=historyIndex.current+(redo?1:-1);if(index<0||index>=history.current.length)return;const previous=history.current[index];if(!previous)return;historyIndex.current=index;pending.current=previous.prompt.length;onChange(previous);setQuery(null)}
 const [revision,setRevision]=useState(0);
 const [query,setQuery]=useState<{start:number;end:number;text:string}|null>(null),[active,setActive]=useState(0);
 function replaceTag(chip:Element){const key=chip.getAttribute('data-mention-key');const token=chip.getAttribute('data-token');const mentions=value.promptMentions??[];const chips=Array.from(root.current?.querySelectorAll('[data-mention-key]')??[]);const mention=mentions[chips.indexOf(chip)];if(mention&&key&&token){tagAnchor.current=chip;setQuery({start:mention.start,end:mention.end,text:''});setActive(Math.max(0,choices.findIndex(c=>c.key===key)))}}
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
 function update(){tagAnchor.current=null;const el=root.current;if(!el||composing.current||disabled)return;const next=read(el);if([...next.prompt].length>maxLength){setRevision(i=>i+1);return;}change(next);const end=offset(el);const match=end===null?null:/(?:^|\s)@([\p{L}\d]*)$/u.exec(next.prompt.slice(0,end));setQuery(match?{start:end!-(match[1]?.length??0)-1,end:end!,text:match[1]??''}:null);setActive(0)}
 function insert(choice:VisualMentionChoice){if(!query)return;const next=insertMention(value,choice,query.start,query.end);if([...next.prompt].length>maxLength)return;pending.current=query.start+choice.label.length+2;change(next);setQuery(null);root.current?.focus()}
 function pasteText(text:string){const el=root.current,selection=window.getSelection();if(!el||!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);update()}
 return <ReferenceSuggestionPopover inputRef={root} getAnchorRect={()=>tagAnchor.current?.getBoundingClientRect()??(root.current?referenceCaretRect(root.current):new DOMRect())} open={!disabled&&!!query&&options.length>0} onOpenChange={open=>{if(!open)setQuery(null)}} label={hint} anchor={<div ref={root} className="reference-rich-input" data-slot={surface==='composer'?'input-group-control':undefined} contentEditable={!disabled} aria-disabled={disabled} role="textbox" aria-label={label} aria-multiline="true" data-placeholder={placeholder} suppressContentEditableWarning onClick={e=>{const chip=(e.target as Element).closest('[data-mention-key]');if(chip)replaceTag(chip)}} onInput={update} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false;update()}} onBlur={()=>setQuery(null)} onPaste={e=>{e.preventDefault();pasteText(e.clipboardData.getData('text/plain'))}} onKeyDown={e=>{
 if(e.nativeEvent.isComposing||disabled)return;
 const chip=(e.target as Element).closest('[data-mention-key]');if(chip&&['Enter',' '].includes(e.key)){e.preventDefault();replaceTag(chip);return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return}
 if((e.metaKey||e.ctrlKey)&&['b','i','u'].includes(e.key.toLowerCase())){e.preventDefault();return}
 if(query&&e.key==='Escape'){e.preventDefault();e.stopPropagation();setQuery(null);return}
 if(query&&options.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setActive(i=>(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);return}
 if(e.key==='Enter'){e.preventDefault();if(query&&options.length)insert((options[active]??options[0])!);else pasteText('\n')}
 }}/>}>{options.map((choice,i)=><ReferenceHover details={choice.details} key={choice.key} label={'@'+choice.label} preview={choice.thumbnail?(choice.mediaKind==='video'?<VideoThumbnail url={choice.thumbnail} onError={()=>{}}/>:<img src={choice.thumbnail} alt=""/>):null}><button type="button" className="reference-prompt-option" data-active={i===active} onClick={()=>insert(choice)}>{choice.thumbnail&&(choice.mediaKind==='video'?<video className="reference-tag-media" muted preload="metadata" src={choice.thumbnail}/>:<img className="reference-tag-media" alt="" src={choice.thumbnail}/>)}<span>@{choice.label}</span></button></ReferenceHover>)}</ReferenceSuggestionPopover>;
}
