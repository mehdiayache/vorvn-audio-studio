import { AudioLines, Gauge, Mic2, WandSparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { ComposerActions } from "./composer-actions"
import { ComposerDialogs } from "./composer-dialogs"
import { ComposerOutput } from "./composer-output"
import { ComposerPerformance } from "./composer-performance"
import { ComposerProvider, type ComposerSection, type ComposerSurfaceProps, useComposerController } from "./composer-controller"
import { ComposerWho } from "./composer-who"
import { ComposerWords } from "./composer-words"

import "./composer.css"

export function ComposerSurface(props: ComposerSurfaceProps) {
  const composer = useComposerController(props)
  const nav: Array<{ key: ComposerSection; label: string; detail: string; icon: typeof AudioLines }> = [
    { key: "who", label: "Who", detail: composer.selectedIdentity?.name || "Choose a voice", icon: Mic2 },
    { key: "words", label: "Words", detail: composer.textSession.text ? `${composer.textSession.text.length} characters` : "Write the words", icon: AudioLines },
    { key: "performance", label: "Performance", detail: composer.methodLabel, icon: WandSparkles },
    { key: "output", label: "Output", detail: composer.currentRoute?.modelId || "No route selected", icon: Gauge },
  ]
  return <ComposerProvider value={composer}>
    <div className="speech-composer composer-surface">
      <aside className="composer-nav" aria-label="Composer sections"><span className="destination-note">{composer.destination}</span>{nav.map(({ key, label, detail, icon: Icon }) => <button key={key} aria-label={`${label}: ${detail}`} className={cn(composer.section === key && "active")} onClick={() => composer.setSection(key)}><Icon /><span><b>{label}</b><small>{detail}</small></span></button>)}</aside>
      <div className="composer-stage">
        {composer.section === "who" && <ComposerWho />}
        {composer.section === "words" && <ComposerWords />}
        {composer.section === "performance" && <ComposerPerformance />}
        {composer.section === "output" && <ComposerOutput />}
      </div>
      <ComposerActions />
      <ComposerDialogs />
    </div>
  </ComposerProvider>
}
