import {createContext,useContext,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
const SurfaceContainer=createContext<HTMLElement|undefined>(undefined);
export const useSurfaceContainer=()=>useContext(SurfaceContainer);
/** Portals inherit the root appearance and direction without clipping to their owner. */
export function SurfaceScope({children,dir,className}:{className?:string;children:ReactNode;dir:'ltr'|'rtl'}){
 const [container,setContainer]=useState<HTMLDivElement|null>(null);
 return <>{createPortal(<div ref={setContainer} data-surface-scope="" dir={dir} className={className}/>,document.body)}{container&&<SurfaceContainer.Provider value={container}>{children}</SurfaceContainer.Provider>}</>;
}
