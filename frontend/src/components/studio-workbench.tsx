import type {ReactNode} from 'react';
import './studio-workbench.css';

/** Extracted from the original TimelineWorkbench. Services, selection and media
 * identity stay with the host; this frame only composes the editing regions. */
export function StudioWorkbench({mediaBrowser, preview, inspector, previewLabel, inspectorLabel,
  className = '', previewClassName = '', inspectorClassName = ''}: {
  mediaBrowser: ReactNode; preview: ReactNode; inspector?: ReactNode;
  previewLabel: string; inspectorLabel: string; className?: string;
  previewClassName?: string; inspectorClassName?: string;
}) {
  return <div className={`studio-workbench ${className}`}>
    {mediaBrowser}
    <section className={`studio-workbench-monitor ${previewClassName}`} aria-label={previewLabel}>{preview}</section>
    {inspector && <aside className={`studio-workbench-inspector ${inspectorClassName}`} aria-label={inspectorLabel}>{inspector}</aside>}
  </div>;
}
