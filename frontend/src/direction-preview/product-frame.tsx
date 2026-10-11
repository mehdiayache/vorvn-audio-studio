import type {ReactNode} from 'react';
import './product-frame.css';
export function ProductFrame({header,navigation,panel,brand,utilities,drawer,drawerOpen=false,chrome=false,tabbar,collapsed,mainClass='',children}:{header:ReactNode;navigation:ReactNode;panel?:ReactNode;brand?:ReactNode;utilities?:ReactNode;drawer?:ReactNode;drawerOpen?:boolean;chrome?:boolean;tabbar?:ReactNode;collapsed:boolean;mainClass?:string;children:ReactNode}) {
 if(chrome)return <div className="dp-chrome-frame">
  <header className="dp-chrome-header"><div className="dp-chrome-brand">{brand}</div>{header}<div className="dp-chrome-navigation">{navigation}</div>{utilities}</header>
  {tabbar&&<div className="dp-chrome-tabbar">{tabbar}</div>}
  <div className="dp-chrome-work"><div className="dp-work-frame">{panel}<section className="dp-body-frame"><main className={`dp-main ${mainClass}`}>{children}</main></section></div>
   {drawer&&<div className="dp-chrome-drawer" inert={!drawerOpen} aria-hidden={!drawerOpen} hidden={!drawerOpen}>{drawer}</div>}
  </div>
 </div>;
 if(!brand)return <><header className="dp-top">{header}</header><div className={`dp-shell ${collapsed?'dp-rail-collapsed':''}`}>{navigation}<main className={`dp-main ${mainClass}`}>{children}</main></div></>;
 return <div className={`dp-shell dp-frame-compact ${drawer?'dp-has-drawer-slot':''} ${drawerOpen?'dp-has-drawer':''} ${collapsed?'dp-rail-collapsed':''}`}>
  {drawer&&<div className="dp-frame-drawer" inert={!drawerOpen} aria-hidden={!drawerOpen}>{drawer}</div>}
  <aside className="dp-rail-frame"><div className="dp-rail-brand">{brand}</div>{navigation}{utilities&&<div className="dp-rail-utilities" aria-label="Account and preferences">{utilities}</div>}</aside>
  <div className="dp-work-frame">{panel}<section className="dp-body-frame"><header className="dp-top">{header}</header><main className={`dp-main ${mainClass}`}>{children}</main></section></div>
 </div>;
}
