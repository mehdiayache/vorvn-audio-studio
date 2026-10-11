import {CheckCircle2,Library,PanelLeftClose,PanelLeftOpen,Plus,Search,Grid3X3,Image,Video,Music} from "lucide-react";
import {memo,useMemo,useState,type ReactNode} from "react";
import {OperatorIconButton} from "../operator-action";
import {Input} from "../ui/input";
import {LoadError} from "../ui/feedback-message";
import {cn} from "../../lib/utils";
import {FileThumbnail} from "../ui/file-thumbnail";
import {FileIdentity} from "../file-identity";
import "./timeline-media-browser.css";
import type {WorkspaceFile} from "./studio-timeline-model";
import {WorkstationPaneHeader} from "./workstation-pane-header";
export type MediaFilter="all"|"image"|"video"|"audio";
export type ScopeFilter="production"|"workspace";
export type StudioMediaQuery={scope:ScopeFilter;media:MediaFilter;query:string};
export type StudioBrowserFile=WorkspaceFile&{searchText?:string;createdAt?:string|null;libraryType?:"image"|"video"|"audio"|"speech"|"music"|"sfx"|"document"|"data"|"subtitle"|"other"};
const libraryFileName=(file:WorkspaceFile)=>file.name||file.title||file.filename||"Media";
const searchText=(file:StudioBrowserFile)=>file.searchText??[libraryFileName(file),file.filename,file.category,file.source,...(file.tags??[])].filter(Boolean).join(" ").toLocaleLowerCase();
/** Actual LibraryQuery matching/recent ordering on host-normalized descriptors. */
export function queryStudioMedia(files:readonly StudioBrowserFile[],scope:ScopeFilter,media:MediaFilter,query:string,productionIds:ReadonlySet<string|number>){
 const search=query.trim().toLocaleLowerCase();
 const time=(file:StudioBrowserFile)=>{const value=file.createdAt?Date.parse(file.createdAt):NaN;return Number.isFinite(value)?value:0};
 return files.map((file,order)=>({file,order})).filter(({file})=>{
  if(scope==="production"&&!productionIds.has(file.id))return false;
  const type=file.libraryType??file.media_type;
  if(media==="audio"&&!["audio","speech","music","sfx"].includes(type))return false;
  if(media!=="all"&&media!=="audio"&&type!==media)return false;
  return !search||searchText(file).toLocaleLowerCase().includes(search);
 }).sort((left,right)=>{
  const recent=time(right.file)-time(left.file);if(recent)return recent;
  if(typeof left.file.id==="number"&&typeof right.file.id==="number"){const ids=right.file.id-left.file.id;if(ids)return ids}
  return left.order-right.order;
 }).map(({file})=>file);
}
const copy = {
 en:{media:'Media',project:'This Project',workspace:'Workspace',search:'Search media',all:'All',image:'Images',video:'Videos',audio:'Audio',browse:'Browse Files',hide:'Hide Media Browser',show:'Show Media Browser',loading:'Loading media',retry:'Retry',error:'Could not load media.',empty:'No matching media',refine:'Change the scope, type or search.',add:'Add at playhead',preview:'Preview',adding:'Adding…'},
 fr:{media:'Médias',project:'Ce Project',workspace:'Espace',search:'Rechercher des médias',all:'Tous',image:'Images',video:'Vidéos',audio:'Audio',browse:'Parcourir les Files',hide:'Masquer les médias',show:'Afficher les médias',loading:'Chargement des médias',retry:'Réessayer',error:'Impossible de charger les médias.',empty:'Aucun média correspondant',refine:'Changez le périmètre, le type ou la recherche.',add:'Ajouter au point de lecture',preview:'Aperçu',adding:'Ajout…'},
 ar:{media:'الوسائط',project:'هذا المشروع',workspace:'مساحة العمل',search:'البحث في الوسائط',all:'الكل',image:'الصور',video:'الفيديو',audio:'الصوت',browse:'تصفح الملفات',hide:'إخفاء الوسائط',show:'عرض الوسائط',loading:'تحميل الوسائط',retry:'إعادة المحاولة',error:'تعذر تحميل الوسائط.',empty:'لا توجد وسائط مطابقة',refine:'غيّر النطاق أو النوع أو البحث.',add:'إضافة عند موضع التشغيل',preview:'معاينة',adding:'جارٍ الإضافة…'},
 id:{media:'Media',project:'Project ini',workspace:'Ruang kerja',search:'Cari media',all:'Semua',image:'Gambar',video:'Video',audio:'Audio',browse:'Jelajahi File',hide:'Sembunyikan media',show:'Tampilkan media',loading:'Memuat media',retry:'Coba lagi',error:'Media tidak dapat dimuat.',empty:'Tidak ada media yang cocok',refine:'Ubah cakupan, jenis, atau pencarian.',add:'Tambah pada posisi putar',preview:'Pratinjau',adding:'Menambahkan…'}
};
export type TimelineMediaBrowserProps={
 files:StudioBrowserFile[];productionFileIds:(string|number)[];usedFileIds:(string|number)[];
 collapsed:boolean;onCollapsedChange:(value:boolean)=>void;selectedFileId?:string|number;
 onPreview:(file:WorkspaceFile)=>void;onAdd:(file:WorkspaceFile)=>Promise<void>|void;
 disabled?:boolean;loading?:boolean;error?:boolean;onRetry?:()=>void;onBrowse?:()=>void;
 renderOrigin?:(file:WorkspaceFile)=>ReactNode;projectLabel?:string;locale?:'en'|'fr'|'ar'|'id';
 value?:StudioMediaQuery;onQueryChange?:(value:StudioMediaQuery)=>void;
 serverFiltered?:boolean;filters?:ReactNode;headerControls?:ReactNode;footer?:ReactNode;
 renderCollection?:(files:StudioBrowserFile[])=>ReactNode;
};
/** The historical Studio shell hosts the same File presentation and collection ports. */
export const TimelineMediaBrowser=memo(function TimelineMediaBrowser({files,productionFileIds,usedFileIds,collapsed,onCollapsedChange,selectedFileId,onPreview,onAdd,disabled=false,loading=false,error=false,onRetry,onBrowse,projectLabel,renderOrigin,locale='en',value,onQueryChange,serverFiltered=false,filters,headerControls,footer,renderCollection}:TimelineMediaBrowserProps){
 const c=copy[locale];
 const [local,setLocal]=useState<StudioMediaQuery>({query:'',media:'all',scope:'production'});
 const current=value??local;
 const change=(patch:Partial<StudioMediaQuery>)=>{const next={...current,...patch};if(onQueryChange)onQueryChange(next);else setLocal(next)};
 const [pendingId,setPendingId]=useState<string|number|null>(null);
 const productionIds=useMemo(()=>new Set(productionFileIds),[productionFileIds]);
 const usedIds=useMemo(()=>new Set(usedFileIds),[usedFileIds]);
 const visible=useMemo(()=>serverFiltered?files:queryStudioMedia(files,current.scope,current.media,current.query,productionIds),[files,current,productionIds,serverFiltered]);
 if(collapsed)return <aside className="timeline-media-browser studio-media-browser is-collapsed" aria-label={c.media}><OperatorIconButton label={c.show} onClick={()=>onCollapsedChange(false)}><PanelLeftOpen/></OperatorIconButton></aside>;
 return <aside className="timeline-media-browser studio-media-browser" aria-label={c.media} dir={locale==='ar'?'rtl':'ltr'}>
  <WorkstationPaneHeader icon={<Library/>} title={c.media} actions={<>{headerControls}{onBrowse&&<OperatorIconButton label={c.browse} onClick={onBrowse}><Library/></OperatorIconButton>}<OperatorIconButton label={c.hide} onClick={()=>onCollapsedChange(true)}><PanelLeftClose/></OperatorIconButton></>}/>
  <div className="studio-media-browser-controls">
   <div className="timeline-media-scope" role="group" aria-label={c.media}>{(['production','workspace'] as const).map(scope=><button key={scope} type="button" aria-pressed={current.scope===scope} onClick={()=>change({scope})}>{scope==='production'?projectLabel??c.project:c.workspace}</button>)}</div>
   <label className="timeline-media-search"><Search/><Input type="search" aria-label={c.search} value={current.query} onChange={event=>change({query:event.target.value})} placeholder={c.search}/></label>
   <div className="timeline-media-types" role="group" aria-label={c.media}>{(['all','image','video','audio'] as const).map(media=><button key={media} type="button" aria-label={c[media]} title={c[media]} aria-pressed={current.media===media} onClick={()=>change({media})}>{media==='all'?<Grid3X3/>:media==='image'?<Image/>:media==='video'?<Video/>:<Music/>}<span>{c[media]}</span></button>)}</div>
   {filters}
  </div>
  <div className="timeline-media-results quiet-scroll" aria-busy={loading}>
   {error&&<LoadError retryLabel={c.retry} onRetry={onRetry??(()=>{})} busy={loading}>{c.error}</LoadError>}
   {loading&&!visible.length?<div className="studio-media-loading" aria-label={c.loading}>{Array.from({length:6},(_,index)=><span key={index} className="ui-skeleton"/>)}</div>:renderCollection?renderCollection(visible):<div className="studio-media-card-grid">{visible.map(file=>{
    const name=libraryFileName(file);return <article key={file.id} className={cn('studio-media-file',file.id===selectedFileId&&'is-selected')}>
     <button type="button" className="studio-media-file-preview" aria-label={`${c.preview} ${name}`} onClick={()=>onPreview(file)}><FileThumbnail name={name} url={file.url??undefined} previewKey={String(file.id)} durationHint={(file.duration_ms??0)/1000}/></button>
     {renderOrigin?.(file)}{usedIds.has(file.id)&&<span className="studio-media-usage"><CheckCircle2/></span>}
     <div className="studio-media-file-caption"><button type="button" onClick={()=>onPreview(file)}><FileIdentity name={name} format={false} wrapName/></button><OperatorIconButton label={`${c.add} · ${name}`} disabled={disabled||pendingId!==null} busy={pendingId===file.id} busyLabel={c.adding} onClick={async()=>{setPendingId(file.id);try{await onAdd(file)}catch{/* Host owns write errors. */}finally{setPendingId(null)}}}><Plus/></OperatorIconButton></div>
    </article>;
   })}</div>}
   {!visible.length&&!loading&&!error&&<div className="timeline-media-empty"><Library/><b>{c.empty}</b><small>{c.refine}</small></div>}
   {footer}
  </div>
 </aside>;
});
