import type {ReactNode} from 'react';
import {FileIdentity} from './file-identity';
import './file-compact-row.css';

/** A File identity row for narrow docks; its trailing action always retains its space. */
export function FileCompactRow({name,mimeType,thumbnail,source,metadata,actions,onOpen,disabled=false,selected=false}:{
 name:string;mimeType?:string;thumbnail:ReactNode;source?:ReactNode;metadata?:ReactNode;
 actions:ReactNode;onOpen:()=>void;disabled?:boolean;selected?:boolean;
}) {
 return <article className="file-compact-row" data-selected={selected}>
  <button type="button" className="file-compact-row-open" aria-label={name} disabled={disabled} onClick={onOpen}>
   <span className="file-compact-row-thumbnail">{thumbnail}</span>
   <FileIdentity name={name} mimeType={mimeType} source={source} metadata={metadata} wrapName/>
  </button>
  <span className="file-compact-row-action">{actions}</span>
 </article>;
}
