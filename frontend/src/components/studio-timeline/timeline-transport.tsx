import {Pause, Play} from 'lucide-react'
import {OperatorIconButton} from '../operator-action'
import {formatTimecode} from '../../lib/format'

export type TimelineTransportLabels = {play:string;pause:string;preparing:string;unavailable:string;description:string;transport:string}
const defaults:TimelineTransportLabels={play:'Play Timeline',pause:'Pause Timeline',preparing:'Preparing Timeline',unavailable:'Add or record audible material before playback.',description:'Controls the complete Production mix.',transport:'Timeline transport'}
/** Actual Studio transport. The authorized host supplies the clock and playback callback. */
export function TimelineTransport({duration,current,playing,preparing=false,available,onToggle,labels={}}:{duration:number;current:number;playing:boolean;preparing?:boolean;available:boolean;onToggle:()=>void;labels?:Partial<TimelineTransportLabels>}) {
  const c={...defaults,...labels}
  const end=Number.isFinite(duration)?Math.max(0,duration):0,time=Math.max(0,Math.min(end,Number(current)||0))
  return <div className="timeline-inline-transport" aria-label={c.transport}>
    <OperatorIconButton label={playing?c.pause:c.play} detail={!available?c.unavailable:c.description} disabled={!available} busy={preparing} busyLabel={c.preparing} onClick={onToggle}>{playing?<Pause/>:<Play/>}</OperatorIconButton>
    <span><b>{formatTimecode(time)}</b><i>/</i><b>{formatTimecode(end)}</b></span>
  </div>
}
