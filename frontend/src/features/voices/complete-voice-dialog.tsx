import { LoaderCircle, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { studioApi } from "@/lib/api"
import type { VoiceProfile } from "@/types/domain"

export function CompleteVoiceDialog({ profile, onOpenChange, onQueued }: {
  profile: VoiceProfile | null
  onOpenChange: (open: boolean) => void
  onQueued: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const readyModels = useMemo(() => new Set(profile?.bindings.map((binding) => binding.model_id)), [profile])
  const activeModels = useMemo(() => new Set(profile?.jobs.filter((job) => ["queued", "creating"].includes(job.status)).map((job) => job.model_id)), [profile])
  const missing = profile?.available_routes.filter((route) => !readyModels.has(route.model_id) && !activeModels.has(route.model_id)) || []
  const savedReference = profile?.references[0]?.id || ""
  useEffect(() => { setFile(null); setError("") }, [profile?.id])
  async function complete() {
    if (!profile || (!savedReference && !file)) return
    setBusy(true)
    try {
      const referenceId = savedReference || (await studioApi.uploadVoiceReference(file!)).reference_id
      const result = await studioApi.createVoicePackage({ identity_id: profile.id, name: profile.name, language: String(profile.metadata.language || ""), reference_id: referenceId, package: "complete", confirmed: true })
      onOpenChange(false); onQueued(); toast.success(`${profile.name} is being completed`, { description: `${result.queued} missing version${result.queued === 1 ? "" : "s"} queued.` })
    } catch (reason) { const message = reason instanceof Error ? reason.message : "Unable to complete this voice."; setError(message); toast.error(message) }
    finally { setBusy(false) }
  }
  return <Dialog open={Boolean(profile)} onOpenChange={(open) => { if (!open && !busy) onOpenChange(false) }}><DialogContent className="voice-complete-dialog"><DialogHeader><DialogTitle>Complete {profile?.name}</DialogTitle><DialogDescription>Create only the installed model versions that are still missing. The source language remains profile information and existing bindings are untouched.</DialogDescription></DialogHeader>{!savedReference && <section className="voice-complete-source"><h3>Source recording needed</h3><p>This older voice has no preserved source. Add one clean recording to build its missing versions.</p><FileDropZone file={file} accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" disabled={busy} onFile={(next) => { setFile(next); setError("") }} hint="WAV, MP3 or M4A · up to 10 MB" /></section>}<div className="voice-complete-routes">{missing.map((route) => <div key={route.model_id}><span><b>{route.label}</b><small>{route.role} · {route.documented_output_languages.length} documented output languages</small></span><em>{route.estimated_creation_cost ? `up to $${route.estimated_creation_cost.toFixed(2)}` : "Free creation"}</em></div>)}</div>{error && <p className="voice-create-error">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !missing.length || (!savedReference && !file)} onClick={() => void complete()}>{busy ? <><LoaderCircle className="spin" /> Preparing…</> : <><Sparkles /> Create {missing.length} version{missing.length === 1 ? "" : "s"}</>}</Button></DialogFooter></DialogContent></Dialog>
}
