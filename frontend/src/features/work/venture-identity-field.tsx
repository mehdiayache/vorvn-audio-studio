import { ImagePlus, Smile, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { VentureMark, isImageIdentity } from "@/components/venture-mark"

const EMOJIS = ["✨", "💜", "🌙", "☀️", "🌿", "🌊", "🕊️", "🙏", "📖", "🎙️", "🎧", "🎵", "💡", "🧠", "🚀", "🌍", "🏡", "🌸", "🦋", "⭐", "🔥", "💎", "🤍", "🪴"]
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]

export function VentureIdentityField({ name, value, file, onValueChange, onFileChange }: {
  name: string
  value: string
  file: File | null
  onValueChange: (value: string) => void
  onFileChange: (file: File | null) => void
}) {
  const [mode, setMode] = useState<"upload" | "emoji">(isImageIdentity(value) ? "upload" : "emoji")
  const [preview, setPreview] = useState(value)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) { setPreview(value); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, value])

  function choose(next: File | null) {
    setError("")
    if (!next) return
    if (!ACCEPTED.includes(next.type)) { setError("Use a JPG, PNG or WEBP logo."); return }
    if (next.size > 8_000_000) { setError("Use a logo smaller than 8 MB."); return }
    onFileChange(next)
  }

  return <div className="venture-identity-field">
    <div className="venture-identity-tabs" role="group" aria-label="Venture identity type">
      <Button type="button" variant="ghost" size="sm" aria-pressed={mode === "upload"} onClick={() => setMode("upload")}><ImagePlus /> Upload logo</Button>
      <Button type="button" variant="ghost" size="sm" aria-pressed={mode === "emoji"} onClick={() => setMode("emoji")}><Smile /> Choose emoji</Button>
    </div>
    <div className="venture-identity-body">
      <VentureMark identity={preview} name={name || "Venture"} className="venture-identity-preview" />
      {mode === "upload" ? <div className={`venture-logo-upload${dragging ? " dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0] || null) }}><Button type="button" variant="outline" onClick={() => input.current?.click()}><Upload /> {isImageIdentity(preview) ? "Replace logo" : "Choose logo"}</Button><p>Square JPG, PNG or WEBP · maximum 8 MB. You can also drop it here.</p><input ref={input} type="file" accept={ACCEPTED.join(",")} hidden onChange={(event) => choose(event.target.files?.[0] || null)} />{error && <small>{error}</small>}</div>
        : <div className="venture-emoji-grid" aria-label="Choose Venture emoji">{EMOJIS.map((emoji) => <button type="button" className={value === emoji && !file ? "selected" : ""} aria-label={`Use ${emoji}`} aria-pressed={value === emoji && !file} onClick={() => { onFileChange(null); onValueChange(emoji); setPreview(emoji) }} key={emoji}>{emoji}</button>)}</div>}
    </div>
  </div>
}
