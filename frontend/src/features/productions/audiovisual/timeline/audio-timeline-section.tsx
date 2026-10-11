import type {ComponentProps} from "react";
import {AudioTimelineSection as SharedAudioTimelineSection} from "@/components/studio-timeline/audio-timeline-section";
import {soundClipSourceUrl} from "@/features/sound-scene/engine/sound-clip-source";
import {audioUrl} from "@/lib/api";
import {TimelineCanvasWaveform} from "./timeline-canvas-waveform";
export {AudioTrackHeaders} from "@/components/studio-timeline/audio-timeline-section";
export function AudioTimelineSection(props:ComponentProps<typeof SharedAudioTimelineSection>){
 const scene={...props.scene,resolved:{...props.scene.resolved,sequence_projection:{...props.scene.resolved.sequence_projection,spans:props.scene.resolved.sequence_projection.spans.map(span=>({...span,sourceUrl:span.filename?audioUrl(span.filename):undefined}))}}};
 return <SharedAudioTimelineSection {...props} scene={scene} clipUrl={clip=>soundClipSourceUrl(clip as Parameters<typeof soundClipSourceUrl>[0])||undefined} renderWaveform={(url,projection)=><TimelineCanvasWaveform url={url} projection={projection}/>}/>;
}
