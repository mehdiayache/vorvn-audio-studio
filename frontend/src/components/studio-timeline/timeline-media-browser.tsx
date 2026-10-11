import {CheckCircle2,Film,Image as ImageIcon,Library,PanelLeftClose,PanelLeftOpen,Plus,Search,Waves} from "lucide-react";
import {memo,useMemo,useState,type ReactNode} from "react";
import {OperatorIconButton} from "../operator-action";
import {Input} from "../ui/input";
import {LoadError,FeedbackMessage} from "../ui/feedback-message";
import {cn} from "../../lib/utils";
import {SoundMediaIcon} from "./studio-audio-presentation";
import type {WorkspaceFile} from "./studio-timeline-model";
import {WorkstationPaneHeader} from "./workstation-pane-header";
type MediaFilter="all"|"image"|"video"|"audio";type ScopeFilter="production"|"workspace";
export type StudioBrowserFile=WorkspaceFile&{searchText?:string;createdAt?:string|null;libraryType?:"image"|"video"|"audio"|"speech"|"music"|"sfx"|"document"|"data"|"subtitle"|"other"};
const libraryFileName=(file:WorkspaceFile)=>file.name||file.title||file.filename||"Media";
const visualFileUrl=(file:WorkspaceFile)=>file.url||"";
const visualFilePlaybackUrl=visualFileUrl;
const visualFilePosterUrl=(file:WorkspaceFile)=>file.posterUrl||"";
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
export const TimelineMediaBrowser = memo(function TimelineMediaBrowser({ files, productionFileIds, usedFileIds, collapsed, onCollapsedChange, selectedFileId, onPreview, onAdd, disabled=false, loading=false, error=false, onRetry, onBrowse, projectLabel="This Project", renderOrigin }: {
  disabled?:boolean
  loading?:boolean
  error?:boolean
  onRetry?:()=>void
  onBrowse?:()=>void
  renderOrigin?:(file:WorkspaceFile)=>ReactNode
  projectLabel?:string
  files: StudioBrowserFile[]
  productionFileIds: (string|number)[]
  usedFileIds: (string|number)[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  selectedFileId?: string|number
  onPreview: (file: WorkspaceFile) => void
  onAdd: (file: WorkspaceFile) => Promise<void> | void
}) {
  const [query, setQuery] = useState("")
  const [media, setMedia] = useState<MediaFilter>("all")
  const [scope, setScope] = useState<ScopeFilter>("production")
  const [pendingId, setPendingId] = useState<string|number|null>(null)
  const productionIds = useMemo(() => new Set(productionFileIds), [productionFileIds])
  const usedIds = useMemo(() => new Set(usedFileIds), [usedFileIds])
  const visible=useMemo(()=>queryStudioMedia(files,scope,media,query,productionIds),[files,media,query,scope,productionIds]);

  if (collapsed) return <aside className="timeline-media-browser is-collapsed" aria-label="Media Browser">
    <OperatorIconButton label="Show Media Browser" detail="Browse Production and Workspace Files without leaving the Timeline." onClick={() => onCollapsedChange(false)}><PanelLeftOpen /></OperatorIconButton>
  </aside>

  return <aside className="timeline-media-browser" aria-label="Media Browser">
    <WorkstationPaneHeader icon={<Library />} title="Media" actions={<>{onBrowse&&<OperatorIconButton label="Browse Files" onClick={onBrowse} disabled={disabled}><Plus/></OperatorIconButton>}<OperatorIconButton label="Hide Media Browser" onClick={() => onCollapsedChange(true)}><PanelLeftClose /></OperatorIconButton></>} />
    <div className="timeline-media-scope" aria-label="Media scope">
      {(["production", "workspace"] as ScopeFilter[]).map((value) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === "production" ? projectLabel : "Workspace"}</button>)}
    </div>
    <label className="timeline-media-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" /></label>
    <div className="timeline-media-types" aria-label="Media type">
      {(["all", "image", "video", "audio"] as MediaFilter[]).map((value) => <button key={value} aria-pressed={media === value} onClick={() => setMedia(value)}>{value === "all" ? "All" : value}</button>)}
    </div>
    <div className="timeline-media-results" aria-busy={loading}>
      {loading&&<p role="status">Loading media…</p>}
      {error&&(onRetry?<LoadError retryLabel="Retry" onRetry={onRetry} busy={loading}>Could not load media.</LoadError>:<FeedbackMessage tone="error" announce>Could not load media.</FeedbackMessage>)}
      {visible.map((file) => {
        const name = libraryFileName(file)
        const selected = file.id === selectedFileId
        return <article key={file.id} className={cn("timeline-media-card", selected && "is-selected")} data-media-type={file.media_type}>
          <button className="timeline-media-card-preview" aria-label={`Preview ${name}`} onClick={() => onPreview(file)}>
            {file.media_type === "image" ? <img src={visualFileUrl(file)} alt="" loading="lazy" decoding="async" />
              : file.media_type === "video" ? <video src={visualFilePlaybackUrl(file)} poster={visualFilePosterUrl(file)} muted preload="metadata" playsInline />
                : <span className="timeline-media-audio-art"><SoundMediaIcon kind={String(file.category || "audio").toLowerCase() === "sfx" ? "sfx" : String(file.category || "").toLowerCase() === "music" ? "music" : "audio"} /></span>}
            <span className="timeline-media-kind">{file.media_type === "image" ? <ImageIcon /> : file.media_type === "video" ? <Film /> : <Waves />}</span>
            {renderOrigin ? renderOrigin(file) : <span className="timeline-media-origin">{file.source}</span>}
            {usedIds.has(file.id) && <span className="timeline-media-used"><CheckCircle2 /></span>}
          </button>
          <footer><button className="timeline-media-name" title={name} onClick={() => onPreview(file)}>{name}</button><OperatorIconButton label={`Add ${name} at playhead`} disabled={disabled||pendingId!==null} busy={pendingId === file.id} busyLabel={`Adding ${name}…`} onClick={async () => { setPendingId(file.id); try { await onAdd(file) } catch { /* Host displays the actionable error. */ } finally { setPendingId(null) } }}><Plus /></OperatorIconButton></footer>
        </article>
      })}
      {!visible.length&&!loading&&!error && <div className="timeline-media-empty"><Library /><b>No matching media</b><small>Change the scope, type or search.</small></div>}
    </div>
  </aside>
})
