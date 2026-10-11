import {AudioLines,AudioWaveform,Film,MicVocal,Music2,Wind} from "lucide-react";
import type {AudioFamily,SoundMediaKind,SoundSceneClip,SoundSceneTrack} from "./studio-timeline-model";
export type {AudioFamily,SoundMediaKind} from "./studio-timeline-model";
export const AUDIO_FAMILY_LABELS:Record<AudioFamily,string>={audio:"Audio",music:"Music",sfx:"Sound Effect",ambience:"Ambience"};
export const SOUND_MEDIA_LABELS:Record<SoundMediaKind,string>={speech:"Speech",audio:"Audio clip",music:"Music clip",sfx:"Sound Effect clip",ambience:"Ambience clip",video:"Video audio clip"};
export function audioFamily(value?:string|null):AudioFamily {const v=String(value||"").trim().toLowerCase();return v==="intro"||v==="outro"||v==="music"?"music":v==="sfx"||v==="ambience"?v:"audio";}
export function audioTrackRole(track:Pick<SoundSceneTrack,"role">){return audioFamily(track.role);}
export function soundClipMediaKind(clip:Pick<SoundSceneClip,"file_kind"|"source_media_type">):SoundMediaKind{return clip.source_media_type==="video"?"video":audioFamily(clip.file_kind);}
export function soundTrackDisplayName(track:Pick<SoundSceneTrack,"name"|"role">){return track.name.trim()||AUDIO_FAMILY_LABELS[audioTrackRole(track)];}
export function SoundMediaIcon({kind}:{kind:SoundMediaKind}){const Icon=kind==="speech"?MicVocal:kind==="music"?Music2:kind==="sfx"?AudioWaveform:kind==="ambience"?Wind:kind==="video"?Film:AudioLines;return <Icon/>;}
