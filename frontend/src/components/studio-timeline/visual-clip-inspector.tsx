import {FeedbackMessage} from "../ui/feedback-message"
import {inspectorText,type InspectorLocale} from "./studio-inspector-copy"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Clock3, Film, FlipHorizontal2, FlipVertical2, Image as ImageIcon, Info, Library, Maximize, Minimize2, RotateCcw, Scan, Volume2 } from "lucide-react"

import { OperatorInspectorSection } from "@/components/operator-inspector-section"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import type { InspectorFile } from "./studio-inspector-model"
const visualFileDetails=(file:InspectorFile)=>file.details||{origin:[],technical:[],library:[]}
const visualFileFacts=(file:InspectorFile)=>({dimensions:file.dimensions||(file.width&&file.height?`${file.width} × ${file.height}`:undefined)})
const visualFileName=(file:InspectorFile)=>file.name||file.title||file.filename||"Missing media"
const visualFilePosterUrl=(file:InspectorFile)=>file.posterUrl||""
const visualFileUrl=(file:InspectorFile)=>file.url||""
import { AudioVolumeControl, type AudioVolumeMix } from "./audio-volume-control"
import { gainToVolumePercent } from "./studio-gain"
import type { VisualClipRef, VisualSceneClip, VisualSceneTrack } from "./studio-timeline-model"
export type VisualInspectorTransform=Pick<Partial<VisualSceneClip>,"position_x"|"position_y"|"scale"|"rotation_degrees"|"flip_horizontal"|"flip_vertical"|"opacity">
export interface VisualInspectorSessionPort {frameClip(ref:VisualClipRef,fit:"cover"|"contain"):void|Promise<unknown>;resetClipTransform(ref:VisualClipRef):void|Promise<unknown>;setClipTransform(ref:VisualClipRef,changes:VisualInspectorTransform):void|Promise<unknown>;previewClipTransform(ref:VisualClipRef,changes:VisualInspectorTransform):void;beginGesture():void;commitGesture():void|Promise<unknown>;cancelGesture?():void;reportError?(message:string):void}

import "./visual-clip-inspector.css"

function milliseconds(value: number) {
  const seconds = value / 1_000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return minutes ? `${minutes}:${remainder.toFixed(1).padStart(4, "0")}` : `${remainder.toFixed(1)}s`
}

export function VisualClipInspector({ clipRef, track, clip, file, session, saving, audioSaving = saving, hasEmbeddedAudio = false, audioMuted = false, audioGain = 1, onAudioMixChange, onAudioMixCommit, videoAudioUnavailable, timingEditor, locale = "en" }: {
  clipRef: VisualClipRef
  track: VisualSceneTrack
  clip: VisualSceneClip
  file?: InspectorFile
  session: VisualInspectorSessionPort
  saving: boolean
  audioSaving?: boolean
  hasEmbeddedAudio?: boolean
  audioMuted?: boolean
  audioGain?: number
  onAudioMixChange?: (mix: AudioVolumeMix) => void
  onAudioMixCommit?: (mix: AudioVolumeMix) => void | Promise<void>
  locale?: InspectorLocale
  timingEditor?: ReactNode
  videoAudioUnavailable?: string
}) {
  const t=(text:string)=>inspectorText(locale,text)
  const [error,setError]=useState("")
  const invoke=(action:()=>void|Promise<unknown>)=>{setError("");try{void Promise.resolve(action()).catch(reason=>{const message=reason instanceof Error?reason.message:String(reason);setError(message);session.reportError?.(message)})}catch(reason){const message=reason instanceof Error?reason.message:String(reason);setError(message);session.reportError?.(message)}}
  const details = file ? visualFileDetails(file) : { origin: [], technical: [], library: [] }
  const facts = file ? visualFileFacts(file) : null
  const name = file ? visualFileName(file) : t("Missing media")
  const thumbnail=file?(file.media_type==="video"?visualFilePosterUrl(file):visualFileUrl(file)):""
  const transformDisabled = saving || clip.locked || track.locked
  return <div className="visual-clip-inspector">
    <div className="visual-inspector-identity">
      <span className="visual-inspector-thumb">{thumbnail ? <img src={thumbnail} alt="" /> : track.media_type === "video" ? <Film /> : <ImageIcon />}</span>
      <span><b>{name}</b><small>{track.media_type === "video" ? t("Video") : t("Image")} · {facts?.dimensions || t("Source unavailable")}</small></span>
    </div>

    <OperatorInspectorSection icon={Clock3} title={t("Timeline placement")} help={t("Move the clip or its edges directly in Timeline. Hold Alt while dragging to bypass snapping.")} className="visual-inspector-placement">
      {timingEditor??<dl>
        <div><dt>{t("Starts")}</dt><dd>{milliseconds(clip.start_ms)}</dd></div>
        <div><dt>{t("Duration")}</dt><dd>{milliseconds(clip.duration_ms)}</dd></div>
        {track.media_type === "video" && <div><dt>{t("Source starts")}</dt><dd>{milliseconds(clip.source_offset_ms)}</dd></div>}
      </dl>}
    </OperatorInspectorSection>

    <OperatorInspectorSection icon={Scan} title={t("Frame")} help={t("Fit and Fill establish a starting frame. Position, scale, rotation and flips then create custom framing.")} actions={<OperatorTooltip label={t("Reset frame")} detail={t("Restores Fill, centered placement, 100% scale, no rotation and no flip. Opacity and audio stay unchanged.")}><Button variant="ghost" size="sm" disabled={transformDisabled} onClick={() => invoke(()=>session.resetClipTransform(clipRef))}><RotateCcw /> {t("Reset")} </Button></OperatorTooltip>} className="visual-inspector-transform">
      <div className="visual-frame-actions" role="group" aria-label={t("Quick framing actions")}>
        <OperatorTooltip label={t("Fit entire source")} detail={t("Recenters and removes rotation so the complete image or video is visible. Empty space may remain.")}><Button variant="outline" size="sm" disabled={transformDisabled} onClick={() => invoke(()=>session.frameClip(clipRef, "contain"))}><Minimize2 /> {t("Fit")} </Button></OperatorTooltip>
        <OperatorTooltip label={t("Fill Production frame")} detail={t("Recenters and removes rotation, then enlarges the source until the frame is covered. Outer edges may be cropped.")}><Button variant="outline" size="sm" disabled={transformDisabled} onClick={() => invoke(()=>session.frameClip(clipRef, "cover"))}><Maximize /> {t("Fill")} </Button></OperatorTooltip>
      </div>
      <div className="visual-transform-position">
        <label><span>X</span><Input key={`x-${Math.round(clip.position_x)}`} name="position_x" aria-label={t("Horizontal position")} type="number" defaultValue={Math.round(clip.position_x)} disabled={transformDisabled} onKeyDown={(event)=>{if(event.key==="Escape"){event.currentTarget.value=String(Math.round(clip.position_x));event.currentTarget.blur();}}} onBlur={(event) => { const value=Number(event.target.value); if(event.target.value.trim() && Number.isFinite(value)&&value!==Math.round(clip.position_x))invoke(()=>session.setClipTransform(clipRef, { position_x:value })) }} /></label>
        <label><span>Y</span><Input key={`y-${Math.round(clip.position_y)}`} name="position_y" aria-label={t("Vertical position")} type="number" defaultValue={Math.round(clip.position_y)} disabled={transformDisabled} onKeyDown={(event)=>{if(event.key==="Escape"){event.currentTarget.value=String(Math.round(clip.position_y));event.currentTarget.blur();}}} onBlur={(event) => { const value=Number(event.target.value); if(event.target.value.trim() && Number.isFinite(value)&&value!==Math.round(clip.position_y))invoke(()=>session.setClipTransform(clipRef, { position_y:value })) }} /></label>
      </div>
      <TransformSlider label={t("Scale")} value={clip.scale * 100} display={`${Math.round(clip.scale * 100)}%`} minimum={5} maximum={300} disabled={transformDisabled} onCancel={()=>session.cancelGesture?.()} onPreview={(value) => session.previewClipTransform(clipRef, { scale: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { scale: value / 100 }); invoke(()=>session.commitGesture()) }} />
      <TransformSlider label={t("Rotation")} value={clip.rotation_degrees} display={`${Math.round(clip.rotation_degrees)}°`} minimum={-180} maximum={180} disabled={transformDisabled} onCancel={()=>session.cancelGesture?.()} onPreview={(value) => session.previewClipTransform(clipRef, { rotation_degrees: value })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { rotation_degrees: value }); invoke(()=>session.commitGesture()) }} />
      <div className="visual-transform-flip" role="group" aria-label={t("Flip media")}>
        <Button variant={clip.flip_horizontal ? "secondary" : "outline"} size="sm" disabled={transformDisabled} aria-pressed={clip.flip_horizontal} onClick={() => invoke(()=>session.setClipTransform(clipRef, { flip_horizontal: !clip.flip_horizontal }))}><FlipHorizontal2 /> {t("Flip horizontal")} </Button>
        <Button variant={clip.flip_vertical ? "secondary" : "outline"} size="sm" disabled={transformDisabled} aria-pressed={clip.flip_vertical} onClick={() => invoke(()=>session.setClipTransform(clipRef, { flip_vertical: !clip.flip_vertical }))}><FlipVertical2 /> {t("Flip vertical")} </Button>
      </div>
      <TransformSlider label={t("Opacity")} value={clip.opacity * 100} display={`${Math.round(clip.opacity * 100)}%`} minimum={0} maximum={100} disabled={transformDisabled} onCancel={()=>session.cancelGesture?.()} onPreview={(value) => session.previewClipTransform(clipRef, { opacity: value / 100 })} onBegin={() => session.beginGesture()} onCommit={(value) => { session.beginGesture(); session.previewClipTransform(clipRef, { opacity: value / 100 }); invoke(()=>session.commitGesture()) }} />
    </OperatorInspectorSection>

    {track.media_type === "video" && <OperatorInspectorSection icon={Volume2} title={t("Video audio")} meta={videoAudioUnavailable ? t("Muted") : hasEmbeddedAudio ? `${audioMuted || audioGain <= 0 ? 0 : gainToVolumePercent(audioGain)}%` : t("None")} metaTechnical help={videoAudioUnavailable || (hasEmbeddedAudio ? "This video's sound follows the visual clip in Timeline and Export." : "This video source has no embedded audio.")} className="visual-inspector-audio">
      {videoAudioUnavailable && <p className="visual-inspector-audio-note">{videoAudioUnavailable}</p>}
      {!videoAudioUnavailable && hasEmbeddedAudio && <div className="visual-inspector-audio-controls">
        <AudioVolumeControl locale={locale} label={t("Video volume")} gain={audioGain} muted={audioMuted} disabled={audioSaving || !onAudioMixChange || !onAudioMixCommit} onPreview={onAudioMixChange} onCommit={(mix) => onAudioMixCommit?.(mix)} />
      </div>}
    </OperatorInspectorSection>}

    {details.origin.length > 0 && <DetailSection title={t("Origin")} icon={Info} items={details.origin} />}
    {details.technical.length > 0 && <DetailSection title={t("Source")} icon={Info} items={details.technical} />}
    {details.library.length > 0 && <DetailSection title={t("Library")} icon={Library} items={details.library} />}
    {error&&<FeedbackMessage tone="error" announce>{error}</FeedbackMessage>}
  </div>
}

function TransformSlider({ label, value, display, minimum, maximum, disabled, onPreview, onBegin, onCommit, onCancel }: { label: string; value: number; display: string; minimum: number; maximum: number; disabled: boolean; onPreview: (value: number) => void; onBegin: () => void; onCommit: (value: number) => void; onCancel:()=>void }) {
  const pending = useRef(value)
  const active = useRef(false)
  const cancelRef=useRef(onCancel);cancelRef.current=onCancel
  useEffect(()=>{ const cancel=()=>{if(active.current){active.current=false;cancelRef.current()}}; const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&active.current&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();cancel()}};window.addEventListener("blur",cancel);window.addEventListener("pointercancel",cancel);window.addEventListener("keydown",escape,true);return()=>{cancel();window.removeEventListener("blur",cancel);window.removeEventListener("pointercancel",cancel);window.removeEventListener("keydown",escape,true)} },[])
  useEffect(()=>{if(disabled&&active.current){active.current=false;cancelRef.current()}},[disabled])
  const committed = useRef(false)
  useEffect(() => { pending.current = value }, [value])
  const preview = (next: number) => { pending.current = next; onPreview(next) }
  const commit = (next: number) => { if(!active.current)return;active.current=false;pending.current = next; committed.current = true; onCommit(next) }
  return <label className="visual-transform-slider"><span><b>{label}</b><strong>{display}</strong></span><Slider aria-label={label} value={[value]} min={minimum} max={maximum} step={1} disabled={disabled}
    onPointerDown={() => { committed.current = false; active.current=true; onBegin() }}
    onKeyDownCapture={(event) => { if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key))return; committed.current = false; active.current=true; onBegin() }}
    onKeyUp={() => { if (!committed.current) commit(pending.current) }}
    onValueChange={([next = value]) => preview(next)}
    onValueCommit={([next = value]) => commit(next)}
  /></label>
}

function DetailSection({ title, icon, items }: { title: string; icon: typeof Info; items: { label: string; value: string }[] }) {
  return <OperatorInspectorSection icon={icon} title={title} className="visual-inspector-details"><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></OperatorInspectorSection>
}
