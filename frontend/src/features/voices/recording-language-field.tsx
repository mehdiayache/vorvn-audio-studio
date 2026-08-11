import { useId } from "react"

import { Input } from "@/components/ui/input"

export function RecordingLanguageField({ value, onChange, suggestions, disabled = false, label = "Language spoken in this recording" }: {
  value: string
  onChange: (value: string) => void
  suggestions: Array<[string, string]>
  disabled?: boolean
  label?: string
}) {
  const listId = useId()
  return <label>
    <span>{label}</span>
    <Input
      value={value}
      list={listId}
      aria-label={label}
      disabled={disabled}
      maxLength={80}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      placeholder="Type or choose a language"
    />
    <datalist id={listId}>{suggestions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</datalist>
    <small>This describes the source recording only. Any language is accepted; undocumented combinations are attempted as Experimental, never blocked.</small>
  </label>
}
