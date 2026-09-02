import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { languageDisplay, languageFlag } from "@/lib/voice"
import { voiceLanguageStatus } from "@/lib/voice-capabilities"
import type { VoiceChoice } from "@/lib/voice-options"

const RECENT_KEY = "origins:recent-output-languages"

function readRecent() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 4) : []
  } catch {
    return []
  }
}

function languageName(value: string) {
  return value === "Auto" ? "Auto detect" : languageDisplay(value)
}

export function CreatorLanguagePicker({ value, options, route, customVoice, onChange }: {
  value: string
  options: string[]
  route?: VoiceChoice
  customVoice: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState(readRecent)
  const recentOptions = useMemo(() => recent.filter((item) => options.includes(item)), [options, recent])
  const allOptions = options.filter((item) => !recentOptions.includes(item))

  function choose(next: string) {
    if (next !== "Auto") {
      const updated = [next, ...recent.filter((item) => item !== next)].slice(0, 4)
      setRecent(updated)
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated)) } catch { /* Private browsing can reject storage. */ }
    }
    onChange(next)
    setOpen(false)
  }

  const item = (language: string) => {
    const status = route ? voiceLanguageStatus(route, language, customVoice) : "undetermined"
    return <CommandItem key={language} value={`${language} ${languageName(language)}`} onSelect={() => choose(language)}>
      <span className="creator-language-flag" aria-hidden="true">{language === "Auto" ? "A" : languageFlag(language)}</span>
      <span className="creator-picker-copy"><b>{languageName(language)}</b>{route && language !== "Auto" && <small>{status === "documented" ? "Documented for this method" : "Not documented · provider may still accept it"}</small>}</span>
      {value === language && <Check className="creator-picker-check" />}
    </CommandItem>
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" className="creator-context-trigger" aria-label="Output language" aria-expanded={open}>
        <span className="creator-language-flag" aria-hidden="true">{value === "Auto" ? "A" : languageFlag(value)}</span>
        <span className="creator-picker-copy"><b>{languageName(value)}</b><small>{route ? voiceLanguageStatus(route, value, customVoice) === "documented" ? "Documented" : value === "Auto" ? "Provider decides" : "Not documented" : "Choose after Voice"}</small></span>
        <ChevronsUpDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="creator-picker-popover creator-language-popover" align="start" sideOffset={6}>
      <Command>
        <CommandInput placeholder="Search languages…" />
        <CommandList>
          <CommandEmpty>No matching language.</CommandEmpty>
          {recentOptions.length > 0 && <CommandGroup heading="Recent">{recentOptions.map(item)}</CommandGroup>}
          <CommandGroup heading="All languages">{allOptions.map(item)}</CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
}
