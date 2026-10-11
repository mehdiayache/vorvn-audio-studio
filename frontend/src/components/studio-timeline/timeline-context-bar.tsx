import type {ReactNode} from 'react'
/** The actual selection footer. Hosts retain selection, feedback and edit transactions. */
export function TimelineContextBar({audioToolbar,visualToolbar,empty='Select a clip or Script Part to edit it',label='Selection actions'}:{audioToolbar?:ReactNode;visualToolbar?:ReactNode;empty?:ReactNode;label?:string}) {
  return <footer className="timeline-selection-bar" aria-label={label}>{visualToolbar||audioToolbar||<span className="selection-bar-empty">{empty}</span>}</footer>
}
