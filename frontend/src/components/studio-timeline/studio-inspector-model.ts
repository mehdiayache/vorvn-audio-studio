import type {WorkspaceFile} from "./studio-timeline-model"
/** Authorized host facts; UI never infers provenance or resolves legacy media URLs. */
export type InspectorFile=Omit<WorkspaceFile,"media_type">&{media_type?:"audio"|"image"|"video";provenance?:string;audio_format?:string|null;sample_rate?:number|null;channels?:number|null;width?:number|null;height?:number|null;dimensions?:string;details?:{origin:{label:string;value:string}[];technical:{label:string;value:string}[];library:{label:string;value:string}[]}}
