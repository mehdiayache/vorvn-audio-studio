import {FolderFormatIcon} from '../components/folder-preview-card';
import {useContext,useId,useState,useMemo,type ReactElement,type ReactNode} from 'react';
import {Folder,ChevronRight,ChevronDown,Check} from 'lucide-react';
import {FileLocaleContext} from '../components/upload/file-locale';
import {Popover,PopoverContent,PopoverTrigger} from '../components/ui/popover';
import {SearchField} from './search-field';
import type {MenuFolder} from './folder-menu-items';
import './folder-picker.css';
import {CollectionFilterContext} from './file-filters';
import './field-select.css';
export function folderPath(folders:MenuFolder[],id:string):string[]{
 const path:string[]=[],seen=new Set<string>();let next:string|null=id;
 while(next&&!seen.has(next)){seen.add(next);const folder=folders.find(f=>f.id===next);if(!folder)break;path.unshift(folder.name);next=folder.parent;}return path;
}
export type LocationNode={section?:boolean;collapsible?:boolean;id:string;name:string;icon?:ReactNode;children?:LocationNode[];onSelect?:()=>void;selected?:boolean;disabled?:boolean;hint?:string};
/** Disclosure navigation: native buttons remain keyboard accessible; search exposes full paths. */
export function LocationNavigator({nodes,searchLabel,emptyLabel,query:externalQuery,persistenceKey}:{persistenceKey?:string;nodes:LocationNode[];searchLabel?:string;emptyLabel?:string;query?:string}){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>{try{const saved=persistenceKey?JSON.parse(sessionStorage.getItem(persistenceKey)??'[]'):[];return new Set(Array.isArray(saved)?saved.filter((id:unknown)=>typeof id==='string'):[])}catch{return new Set()}});
 const toggleSection=(id:string)=>setCollapsed(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);try{if(persistenceKey)sessionStorage.setItem(persistenceKey,JSON.stringify([...next]))}catch{}return next});
 const locale=useContext(FileLocaleContext),[localQuery,setQuery]=useState(''),[expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const copy={en:{search:'Search folders',empty:'No matching locations'},fr:{search:'Rechercher des dossiers',empty:'Aucun emplacement correspondant'},ar:{search:'البحث في المجلدات',empty:'لا توجد مواقع مطابقة'},id:{search:'Cari folder',empty:'Tidak ada lokasi yang cocok'}}[locale];
 const selectedBranches=useMemo(()=>{
  const selected=new Set<string>();
  const visit=(node:LocationNode):boolean=>{
   let containsSelected=!!node.selected;
   for(const child of node.children??[])if(visit(child))containsSelected=true;
   if(containsSelected)selected.add(node.id);
   return containsSelected;
  };
  for(const node of nodes)visit(node);
  return selected;
 },[nodes]);
 const rows:{node:LocationNode;path:string[];depth:number}[]=[];
 const query=externalQuery??localQuery;
 const searching=!!query.trim(),needle=query.trim().toLocaleLowerCase();
 const visit=(items:LocationNode[],path:string[]=[],depth=0)=>{for(const node of items){if(node.section){if(!searching)rows.push({node,path,depth:0});if(searching||!node.collapsible||!collapsed.has(node.id))visit(node.children??[],path,depth);continue;}const next=[...path,node.name];if(!searching||next.join(' / ').toLocaleLowerCase().includes(needle))rows.push({node,path:next,depth});if(searching||expanded.has(node.id)||(!expanded.has('closed:'+node.id)&&selectedBranches.has(node.id)))visit(node.children??[],next,depth+1)}};
 visit(nodes);
 return <div className="folder-navigator">{externalQuery===undefined&&<SearchField label={searchLabel??copy.search} value={query} onChange={setQuery}/>}<div className="folder-navigator-results quiet-scroll">
 {rows.map(({node,path,depth})=>{if(node.section)return <h3 className="folder-navigator-section" key={node.id}>{node.collapsible?<button type="button" aria-expanded={!collapsed.has(node.id)} onClick={()=>toggleSection(node.id)}><span>{node.name}</span><ChevronRight size={14}/></button>:node.name}</h3>;const branch=!!node.children?.length,isOpen=expanded.has(node.id)||(!expanded.has('closed:'+node.id)&&selectedBranches.has(node.id));const expand=()=>setExpanded(current=>{const next=new Set(current);if(isOpen){next.delete(node.id);next.add('closed:'+node.id)}else{next.add(node.id);next.delete('closed:'+node.id)}return next});return <div key={node.id} className="folder-navigator-entry" style={{paddingInlineStart:`calc(${searching?0:Math.min(depth,8)} * var(--space-4))`}}>
 {branch&&!searching?<button type="button" className="folder-navigator-expand" aria-label={node.name} aria-expanded={isOpen} onClick={expand}><ChevronRight size={14}/></button>:<span className="folder-navigator-gutter"/>}
 <button type="button" className="folder-navigator-row" disabled={node.disabled} aria-label={path.join(' / ')} title={path.join(' / ')} aria-current={node.selected?'location':undefined} aria-expanded={!node.onSelect&&branch?isOpen:undefined} onClick={node.onSelect??(branch?expand:undefined)}>{node.icon??<FolderFormatIcon compact navigation/>}<span>{node.name}{searching&&path.length>1&&<small>{path.slice(0,-1).join(' / ')}</small>}</span>{node.hint&&<small className="folder-navigator-hint">{node.hint}</small>}{node.selected&&<Check size={14}/>}</button>
 </div>})}
 {!rows.length&&<p role="status">{emptyLabel??copy.empty}</p>}</div></div>;
}
export function folderLocationNodes(folders:MenuFolder[],onChange:(id:string)=>void,value?:string|null):LocationNode[]{
 const byId=new Map<string,MenuFolder>(),children=new Map<string|null,MenuFolder[]>();
 // Preserve source order while treating a repeated ID as one destination.
 for(const folder of folders)if(!byId.has(folder.id))byId.set(folder.id,folder);
 for(const folder of byId.values()){
  const siblings=children.get(folder.parent);
  if(siblings)siblings.push(folder);else children.set(folder.parent,[folder]);
 }
 const seen=new Set<string>();
 const node=(folder:MenuFolder):LocationNode=>{
  seen.add(folder.id);
  const descendants:LocationNode[]=[];
  for(const child of children.get(folder.id)??[])if(!seen.has(child.id))descendants.push(node(child));
  return {id:folder.id,name:folder.name,selected:value===folder.id,onSelect:()=>onChange(folder.id),children:descendants};
 };
 const roots:LocationNode[]=[];
 for(const folder of byId.values())if(!seen.has(folder.id)&&(folder.parent===null||!byId.has(folder.parent)))roots.push(node(folder));
 // Malformed legacy cycles remain discoverable without recursing indefinitely.
 for(const folder of byId.values())if(!seen.has(folder.id))roots.push(node(folder));
 return roots;
}
type NavigatorProps={query?:string;folders:MenuFolder[];value?:string|null;onChange:(value:string|null)=>void;allowRoot?:boolean;rootLabel?:string;searchLabel?:string;emptyLabel?:string};
export function FolderNavigator({folders,value,onChange,allowRoot=true,rootLabel='Files',searchLabel,emptyLabel,query}:NavigatorProps){
 const nodes=folderLocationNodes(folders,onChange,value);
 return <LocationNavigator query={query} nodes={allowRoot?[{id:'root',name:rootLabel,onSelect:()=>onChange(null),selected:value===null},...nodes]:nodes} searchLabel={searchLabel} emptyLabel={emptyLabel}/>;
}
export function FolderPicker({allowRoot=true,folders,value,onChange,disabled,trigger,label='Folder',rootLabel='No folder',searchLabel,emptyLabel}:NavigatorProps&{trigger?:ReactElement;disabled?:boolean;label?:string}){
 const id=useId(),[open,setOpen]=useState(false),compact=useContext(CollectionFilterContext);
 return <div className={`dp-field${compact?" collection-filter":""}`}><label id={id} className={trigger||compact?'sr-only':undefined}>{label}</label><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger??<button type="button" name="upload_folder" disabled={disabled} aria-labelledby={id} className="vb-select-trigger upload-folder-trigger" data-slot="select-trigger">{compact?<span className="collection-filter-label">{label}</span>:<FolderFormatIcon compact navigation/>}<span className="collection-filter-value">{folders.find(folder=>folder.id===value)?.name??rootLabel}</span><ChevronDown size={14}/></button>}</PopoverTrigger><PopoverContent align="start" className="folder-navigator-popover"><FolderNavigator folders={folders} value={value} allowRoot={allowRoot} rootLabel={rootLabel} searchLabel={searchLabel} emptyLabel={emptyLabel} onChange={next=>{onChange(next);setOpen(false)}}/></PopoverContent></Popover></div>;
}
