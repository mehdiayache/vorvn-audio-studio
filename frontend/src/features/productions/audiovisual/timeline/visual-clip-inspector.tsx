import type {ComponentProps} from "react"
import {VisualClipInspector as StudioVisualClipInspector} from "@/components/studio-timeline/visual-clip-inspector"
import {visualFileDetails,visualFileFacts,visualFileName,visualFilePosterUrl,visualFileUrl} from "@/features/files/file-presentation"
import type {VisualSceneSession} from "@/features/visual-scene/engine/visual-scene-session"
import type {VisualSceneClip,VisualSceneTrack,WorkspaceFile} from "@/types/domain"
type Props=Omit<ComponentProps<typeof StudioVisualClipInspector>,"file"|"session"|"clip"|"track">&{file?:WorkspaceFile;session:VisualSceneSession;clip:VisualSceneClip;track:VisualSceneTrack}
export function VisualClipInspector({file,...props}:Props){
 return <StudioVisualClipInspector {...props} file={file?{id:file.id,name:visualFileName(file),media_type:file.media_type==="video"?"video":"image",url:visualFileUrl(file),posterUrl:visualFilePosterUrl(file),dimensions:visualFileFacts(file).dimensions,details:visualFileDetails(file)}:undefined}/>
}
