import type {ComponentProps} from "react";
import {SequenceTimelineClip as SharedSequenceTimelineClip} from "@/components/studio-timeline/sequence-timeline-clip";
import {audioUrl} from "@/lib/api";
import {TimelineCanvasWaveform} from "./timeline-canvas-waveform";
export function SequenceTimelineClip(props:ComponentProps<typeof SharedSequenceTimelineClip>){return <SharedSequenceTimelineClip {...props} span={{...props.span,sourceUrl:props.span.filename?audioUrl(props.span.filename):undefined}} renderWaveform={url=><TimelineCanvasWaveform url={url}/>}/>;}
