import type {ReactNode} from 'react';
import './caption-workspace.css';
/** Context, cue collection and correction are siblings, with deliberate scroll ownership. */
export function CaptionWorkspace({context,navigation,tools,cues,inspector,footer,locale='en'}:{context:ReactNode;navigation?:ReactNode;tools?:ReactNode;cues:ReactNode;inspector?:ReactNode;footer?:ReactNode;locale?:'en'|'fr'|'ar'|'id'}){
 return <section className="caption-workspace-view" dir={locale==='ar'?'rtl':'ltr'}><header className="caption-workspace-context">{context}</header>{navigation&&<nav className="caption-workspace-navigation">{navigation}</nav>}{tools&&<div className="caption-workspace-tools">{tools}</div>}<div className="caption-workspace-main"><div className="caption-workspace-cues quiet-scroll">{cues}</div>{inspector&&<aside className="caption-workspace-inspector quiet-scroll">{inspector}</aside>}</div>{footer&&<footer className="caption-workspace-footer">{footer}</footer>}</section>;
}
