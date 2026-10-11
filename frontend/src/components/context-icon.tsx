import {VoiceMark} from './voice-mark';
import {WorkspaceIcon} from "./workspace-icon";
import { Mic, Files, AudioLines, SwatchBook, Box, Check, Clapperboard, FileImage, Folder, PanelsTopLeft, UserRound } from 'lucide-react';

export const contextKinds = {
  file: { icon: FileImage, label: 'File' },
  citizen: { icon: UserRound, label: 'Character' },
  character: {icon:UserRound,label:'Character'},
  voice: { icon: VoiceMark, label: 'Voice' },
  speech: { icon: Mic, label: 'Speech' },
  brand: { icon: SwatchBook, label: 'Brand' },
  product: { icon: Box, label: 'Product' },
  project: { icon: Files, label: 'Project' },
  folder: { icon: Folder, label: 'Folder' },
  production: { icon: Clapperboard, label: 'Project' },
  workspace: { icon: WorkspaceIcon, label: 'Workspace' },
  capability: { icon: AudioLines, label: 'Generate' },
} as const;

export type ContextIdentityProps = {
  kind: keyof typeof contextKinds;
  name: string;
  imageUrl?: string;
};

/** One icon source for category navigation, identities and empty states. */
export function ContextIcon({ kind, size = 15 }: { kind: ContextIdentityProps['kind']; size?: number }) {
  const Icon = contextKinds[kind].icon;
  return <Icon size={size} aria-hidden="true"/>;
}

