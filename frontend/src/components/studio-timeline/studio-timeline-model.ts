import type {AudioEffect} from "../../lib/audio-effects";
/** Presentation contracts from the original Studio. IDs and URLs are host-owned;
 * these descriptors never become a persisted Project or an authorization source. */
export type AudioFamily="audio"|"music"|"sfx"|"ambience";
export type SoundMediaKind=AudioFamily|"speech"|"video";
export type SoundClipRef={trackId:string;clipId:string};
export type VisualClipRef=SoundClipRef;
export type SoundSelection=null|{kind:"part";id:number}|{kind:"clip";trackId:string;clipId:string}|{kind:"clips";clips:SoundClipRef[]};
export type SequenceMixOverride={gain:number;muted:boolean;fade_in_ms:number;fade_out_ms:number;effects:AudioEffect[]};
export type SequenceProjectionSpan={part_id:number;part_public_id:string;position?:number|null;kind:string;title:string;role:string;voice_name:string;filename:string;start_ms:number;duration_ms:number;silence:boolean;missing:boolean;mix:SequenceMixOverride;text?:string;sourceUrl?:string};
export type SoundSceneClip={id:string;file_id:number|string;duration_ms:number|null;source_offset_ms:number;gain:number;fade_in_ms:number;fade_out_ms:number;loop:boolean;ducking:boolean;duck_amount_db?:number;muted:boolean;locked:boolean;effects:AudioEffect[];file_name?:string;file_kind?:string;filename?:string;source_duration_ms?:number;source_media_type?:"audio"|"video";missing?:boolean;resolved_start_ms?:number|null;resolved_duration_ms?:number;orphan?:boolean;sourceUrl?:string};
export type SoundSceneTrack={id:string;kind:"audio";role:AudioFamily;name:string;volume:number;muted:boolean;clips:SoundSceneClip[]};
export type SoundSceneEngineState={tracks:{id:string;volume:number;clips:{id:string;startSample:number;durationSamples:number}[]}[]};
export type SoundScene={resolved:{sequence_projection:{spans:SequenceProjectionSpan[]}}};
export type VisualSceneClip={id:string;file_id:number|string;start_ms:number;duration_ms:number;source_offset_ms:number;fit:"cover"|"contain";position_x:number;position_y:number;scale:number;rotation_degrees:number;flip_horizontal:boolean;flip_vertical:boolean;opacity:number;locked:boolean};
export type VisualSceneTrack={id:string;name:string;media_type:"image"|"video";visible:boolean;locked:boolean;clips:VisualSceneClip[]};
export type WorkspaceFile={id:number|string;name?:string|null;title?:string|null;filename?:string|null;media_type:"audio"|"image"|"video";category?:string|null;kind?:string|null;url?:string|null;posterUrl?:string|null;duration_ms?:number|null;source?:string|null;tags?:string[]};
export type WaveformProjection={clipDuration:number;sourceDuration:number;sourceOffset:number;loop:boolean};
