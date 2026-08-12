import {
  Activity, AudioLines, Captions, Check, ChevronDown, CircleDollarSign,
  FolderKanban, Library, ListMusic, Menu, Mic2,
  Music2, Pause, Play, RefreshCw, Search, Settings2, Sparkles, SquareStack,
  TriangleAlert, UsersRound, Volume2, WandSparkles, X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type StudioIconRole =
  | "studio" | "work" | "venture" | "project" | "series" | "production"
  | "speak" | "voices" | "batch" | "subtitles" | "activity" | "settings"
  | "cast" | "speech" | "music" | "play" | "pause" | "volume"
  | "search" | "menu" | "close" | "success" | "warning" | "retry"
  | "expand" | "cost" | "sparkles"

export const studioIcons: Record<StudioIconRole, LucideIcon> = {
  studio: AudioLines,
  work: FolderKanban,
  venture: Library,
  project: FolderKanban,
  series: SquareStack,
  production: ListMusic,
  speak: Mic2,
  voices: UsersRound,
  batch: SquareStack,
  subtitles: Captions,
  activity: Activity,
  settings: Settings2,
  cast: UsersRound,
  speech: WandSparkles,
  music: Music2,
  play: Play,
  pause: Pause,
  volume: Volume2,
  search: Search,
  menu: Menu,
  close: X,
  success: Check,
  warning: TriangleAlert,
  retry: RefreshCw,
  expand: ChevronDown,
  cost: CircleDollarSign,
  sparkles: Sparkles,
}

export function StudioIcon({ role, ...props }: { role: StudioIconRole } & React.ComponentProps<LucideIcon>) {
  const Icon = studioIcons[role]
  return <Icon aria-hidden="true" focusable="false" {...props} />
}
