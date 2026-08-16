import { Badge } from "@/components/ui/badge"

import "./voice-gender-badge.css"

export function voiceGenderLabel(value?: unknown) {
  const gender = String(value || "").trim()
  if (!gender) return null
  const normalized = gender.toLocaleLowerCase()
  if (["female", "woman", "feminine"].includes(normalized)) return "Female"
  if (["male", "man", "masculine"].includes(normalized)) return "Male"
  if (["non-binary", "nonbinary", "non binary"].includes(normalized)) return "Non-binary"
  return gender.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function VoiceGenderBadge({ gender }: { gender?: unknown }) {
  const label = voiceGenderLabel(gender)
  if (!label) return null
  const tone = label === "Female" ? "female" : label === "Male" ? "male" : label === "Non-binary" ? "non-binary" : "neutral"
  return <Badge variant="outline" className={`voice-gender-badge is-${tone}`} data-gender={tone}>{label}</Badge>
}
