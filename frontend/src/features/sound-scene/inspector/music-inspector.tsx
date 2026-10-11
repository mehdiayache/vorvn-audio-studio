import type {ComponentProps} from "react"
import {AudioClipInspector as StudioAudioClipInspector} from "@/components/studio-timeline/audio-clip-inspector"
import {soundClipSourceUrl} from "../engine/sound-clip-source"
import {fileSourceLine} from "@/lib/file-provenance"
import {AudioSourceEditor} from "../source-editor/music-source-editor"
import type {WorkspaceFile,SoundSceneClip,SoundSceneTrack,PlayerSource} from "@/types/domain"
type Props=Omit<ComponentProps<typeof StudioAudioClipInspector>,"file"|"clip"|"track"|"onPlay"|"renderSourceEditor"|"onClipChange">&{file?:WorkspaceFile;clip:SoundSceneClip|null;track:SoundSceneTrack;onPlay:(source:PlayerSource)=>void;onClipChange:(changes:Partial<SoundSceneClip>)=>void}
export function AudioClipInspector({file,clip,onClipChange,...props}:Props){
 return <StudioAudioClipInspector {...props} onClipChange={changes=>{const {file_id,...rest}=changes;onClipChange({...rest,...(typeof file_id==="number"?{file_id}:{})})}} clip={clip?{...clip,sourceUrl:soundClipSourceUrl(clip)}:null} file={file?{...file,media_type:"audio",provenance:fileSourceLine(file)}:undefined} renderSourceEditor={sourceProps=><AudioSourceEditor {...sourceProps}/>}/>
}
