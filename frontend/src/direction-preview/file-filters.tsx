import {Children,createContext,useState,useId,type ReactNode} from 'react';
import './file-filters.css';
import {SlidersHorizontal} from 'lucide-react';
import {Button} from '../components/ui/button';
import {useFileText} from '../components/upload/file-locale';
export const CollectionFilterContext=createContext(false);
export function FileFilters({children,controls,summary,disabled=false,activeCount=0}:{summary?:ReactNode;activeCount?:number;disabled?:boolean;children:ReactNode;controls:ReactNode}){
 const [open,setOpen]=useState(false),id=useId(),t=useFileText(),hasFilters=Children.toArray(children).length>0;
 return <CollectionFilterContext.Provider value={true}><div inert={disabled} className="file-collection-filters">{summary&&<div className="file-collection-summary">{summary}</div>}{hasFilters&&<Button variant="ghost" className="collection-filter-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={16}/>{t("Filters")}{activeCount>0&&<span>{activeCount}</span>}</Button>}{controls&&<div className="file-collection-display">{controls}</div>}<div id={id} hidden={!open} className="file-collection-filter-items">{children}</div></div></CollectionFilterContext.Provider>;
}
