import { Archive, Image as ImageIcon, LoaderCircle, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { studioApi } from "@/lib/api"
import type { VoiceProfile } from "@/types/domain"

type FormState = {
  name: string
  gender: string
  age: string
  accent: string
  trait: string
  scene: string
  notes: string
  editorialLanguage: string
  favourite: boolean
}

const emptyForm: FormState = { name: "", gender: "", age: "", accent: "", trait: "", scene: "", notes: "", editorialLanguage: "", favourite: false }

export function EditVoiceDialog({ profile, onOpenChange, onSaved, onArchived }: {
  profile: VoiceProfile | null
  onOpenChange: (open: boolean) => void
  onSaved: (profile: VoiceProfile) => void
  onArchived: () => void
}) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState<"save" | "archive" | "">("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!profile) return
    setForm({
      name: profile.name,
      gender: String(profile.metadata.gender || ""),
      age: profile.metadata.age ? String(profile.metadata.age) : "",
      accent: String(profile.metadata.accent || ""),
      trait: String(profile.metadata.trait || ""),
      scene: String(profile.metadata.scene || ""),
      notes: String(profile.metadata.notes || ""),
      editorialLanguage: String(profile.metadata.editorial_language || ""),
      favourite: Boolean(profile.metadata.favourite),
    })
    setImage(null); setBusy(""); setError("")
  }, [profile])

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    if (!profile || !form.name.trim()) return
    setBusy("save"); setError("")
    try {
      let imageUrl = String(profile.metadata.image || "")
      if (image) imageUrl = (await studioApi.uploadVoiceImage(image)).url
      const saved = await studioApi.updateVoiceProfile(profile.id, {
        name: form.name.trim(), image: imageUrl, gender: form.gender,
        age: form.age ? Number(form.age) : null, accent: form.accent.trim(),
        trait: form.trait.trim(), scene: form.scene.trim(), notes: form.notes.trim(),
        editorial_language: form.editorialLanguage.trim().toLocaleLowerCase(),
        favourite: form.favourite,
      })
      onSaved(saved); onOpenChange(false); toast.success("Voice details saved.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this voice.")
    } finally { setBusy("") }
  }

  async function archive() {
    if (!profile || !window.confirm(`Archive ${profile.name}? Existing productions keep their audio and voice reference.`)) return
    setBusy("archive"); setError("")
    try {
      await studioApi.archiveVoiceProfile(profile.id)
      onArchived(); onOpenChange(false); toast.success("Voice archived.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive this voice.")
    } finally { setBusy("") }
  }

  const recordingLanguage = String(profile?.metadata.recording_language || profile?.metadata.language || "")
  return <Dialog open={Boolean(profile)} onOpenChange={(open) => { if (!busy) onOpenChange(open) }}>
    <DialogContent className="voice-edit-dialog">
      <DialogHeader><DialogTitle>Edit voice</DialogTitle><DialogDescription>This identity supplies its name, portrait and casting details everywhere in Audio Studio.</DialogDescription></DialogHeader>
      <div className="voice-edit-content">
        <section className="voice-edit-portrait">
          <div className="voice-edit-current-image">{profile?.metadata.image ? <img src={String(profile.metadata.image)} alt="" /> : <ImageIcon />}</div>
          <FileDropZone file={image} kind="image" accept="image/png,image/jpeg,image/webp" hint="PNG, JPG or WebP · square works best" disabled={Boolean(busy)} onFile={(file) => { setImage(file); setError("") }} />
        </section>
        <div className="voice-edit-grid">
          <label className="wide"><span>Voice name</span><Input value={form.name} maxLength={80} onChange={(event) => change("name", event.target.value)} /></label>
          <label><span>Gender description</span><Select value={form.gender || "unspecified"} onValueChange={(value) => change("gender", value === "unspecified" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">Not specified</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="non-binary">Non-binary</SelectItem></SelectContent></Select></label>
          <label><span>Perceived age</span><Input type="number" min="1" max="120" value={form.age} placeholder="e.g. 35" onChange={(event) => change("age", event.target.value)} /></label>
          <label><span>Accent</span><Input value={form.accent} placeholder="e.g. neutral American" onChange={(event) => change("accent", event.target.value)} /></label>
          <label><span>Team language tag</span><Input value={form.editorialLanguage} maxLength={12} placeholder="e.g. ar or en" onChange={(event) => change("editorialLanguage", event.target.value)} /><small>Optional casting tag and flag. Never limits output.</small></label>
          <label><span>Voice character</span><Input value={form.trait} placeholder="e.g. warm, grounded, intimate" onChange={(event) => change("trait", event.target.value)} /></label>
          <label className="wide"><span>Best used for</span><Input value={form.scene} placeholder="e.g. bedtime stories and quiet narration" onChange={(event) => change("scene", event.target.value)} /></label>
          <label className="wide"><span>Team notes</span><Textarea value={form.notes} placeholder="Pronunciation, casting or recording notes" onChange={(event) => change("notes", event.target.value)} /></label>
        </div>
        <div className="voice-edit-facts"><span><b>Reference recording</b>{recordingLanguage ? `${recordingLanguage} · technical provenance` : "Not recorded"}</span><span><b>Internal ID</b><code>{profile?.id}</code></span></div>
        <label className="voice-edit-favourite"><Checkbox checked={form.favourite} onCheckedChange={(checked) => change("favourite", checked === true)} /><Star /> Pin this voice as a team favourite</label>
        {error && <p className="voice-create-error">{error}</p>}
      </div>
      <DialogFooter className="voice-edit-footer"><Button variant="ghost" className="voice-archive-action" disabled={Boolean(busy)} onClick={() => void archive()}>{busy === "archive" ? <LoaderCircle className="spin" /> : <Archive />} Archive</Button><span /><Button variant="outline" disabled={Boolean(busy)} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={Boolean(busy) || !form.name.trim()} onClick={() => void save()}>{busy === "save" && <LoaderCircle className="spin" />} Save voice</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
