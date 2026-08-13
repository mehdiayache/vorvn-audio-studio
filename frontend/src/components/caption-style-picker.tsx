import { AlignJustify, Captions, Type } from "lucide-react"

import { cn } from "@/lib/utils"
import type { CaptionLayout, CaptionProfile } from "@/types/domain"

import "./caption-style-picker.css"

const options: Array<{ key: CaptionProfile; label: string; detail: string; icon: typeof Captions }> = [
  { key: "standard", label: "Standard", detail: "Readable · up to 2 lines", icon: AlignJustify },
  { key: "short", label: "Short", detail: "Roughly 2–5 words", icon: Captions },
  { key: "words", label: "Word by word", detail: "One timed word per cue", icon: Type },
]

export function CaptionStylePicker({ value, layout, busy, onChange }: {
  value: CaptionProfile
  layout: CaptionLayout | null
  busy: boolean
  onChange: (value: CaptionProfile) => void
}) {
  return <section className="caption-styles" aria-labelledby="caption-style-title">
    <header><div><h3 id="caption-style-title">Caption style</h3><p>Change the layout for free. The audio is not transcribed again.</p></div>{layout && <span className={cn("timing-badge", layout.timing_quality === "estimated" && "estimated")}>{layout.timing_quality === "word_aligned" ? "Word timing" : "Estimated timing"}</span>}</header>
    <div className="caption-style-options">
      {options.map((option) => { const Icon = option.icon; return <button type="button" key={option.key} className={cn(value === option.key && "active")} aria-pressed={value === option.key} disabled={busy} onClick={() => onChange(option.key)}><Icon /><span><b>{option.label}</b><small>{option.detail}</small></span></button> })}
    </div>
    {layout && <div className="caption-metrics" aria-label="Caption layout summary"><span><b>{layout.metrics.cues}</b> cues</span><span><b>{layout.metrics.average_words}</b> words / cue</span><span><b>{layout.metrics.maximum_cps}</b> max chars / sec</span></div>}
  </section>
}
