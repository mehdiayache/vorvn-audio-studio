import { LoaderCircle, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RecordingLanguageField } from "@/features/voices/recording-language-field"
import { studioApi } from "@/lib/api"
import type { StudioConfig, VoiceProfile } from "@/types/domain"
import { bindingMatchesRoute, jobMatchesRoute } from "./voice-route"

export function CompleteVoiceDialog({ profile, config, onOpenChange, onQueued }: {
  profile: VoiceProfile | null
  config: StudioConfig | null
  onOpenChange: (open: boolean) => void
  onQueued: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [referenceId, setReferenceId] = useState("")
  const [recordingLanguage, setRecordingLanguage] = useState("")
  const [error, setError] = useState("")
  const missing = useMemo(() => profile?.available_routes.filter((route) =>
    !profile.bindings.some((binding) => binding.reference_id === referenceId && bindingMatchesRoute(binding, route)) &&
    !profile.jobs.some((job) => job.reference_id === referenceId && jobMatchesRoute(job, route)),
  ) || [], [profile, referenceId])
  const selectedReference = profile?.references.find((reference) => reference.id === referenceId)
  const requiresUpload = !profile?.references.length
  const languages = useMemo(() => {
    const map = new Map<string, string>()
    Object.values(config?.capabilities || {}).forEach((capability) => {
      Object.entries(capability.clone_languages || {}).forEach(([code, label]) => map.set(code, label))
    })
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [config])

  useEffect(() => {
    setFile(null)
    const preferred = profile?.references.find((reference) => reference.id === profile.preferred_reference_id) || profile?.references[0]
    setReferenceId(preferred?.id || "")
    setRecordingLanguage(String(preferred?.source_language || profile?.metadata.recording_language || profile?.metadata.language || ""))
    setError("")
  }, [profile?.id, profile?.metadata.language, profile?.metadata.recording_language, profile?.preferred_reference_id, profile?.references])

  async function complete() {
    if (!profile || (requiresUpload && !file)) return
    setBusy(true)
    try {
      const explicitReferenceId = file ? (await studioApi.uploadVoiceReference(file)).reference_id : referenceId
      const result = await studioApi.createVoicePackage({
        identity_id: profile.id,
        name: profile.name,
        language: recordingLanguage,
        editorial_language: String(profile.metadata.editorial_language || ""),
        reference_id: explicitReferenceId,
        package: "complete",
        confirmed: true,
      })
      onOpenChange(false)
      onQueued()
      toast.success(`${profile.name} is being completed`, { description: `${result.queued} missing model version${result.queued === 1 ? "" : "s"} queued.` })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to complete this voice."
      setError(message)
      toast.error(message)
    } finally { setBusy(false) }
  }

  return <Dialog open={Boolean(profile)} onOpenChange={(open) => { if (!open && !busy) onOpenChange(false) }}>
    <DialogContent className="voice-complete-dialog">
      <DialogHeader>
        <DialogTitle>Complete {profile?.name}</DialogTitle>
        <DialogDescription>Create only the missing provider model versions. Existing working versions remain untouched.</DialogDescription>
      </DialogHeader>
      {requiresUpload && <section className="voice-complete-source">
        <h3>Reference recording needed</h3>
        <p>This historical voice has no preserved reference. Add one clean recording to attempt its missing installed methods. An undocumented source language is Experimental, never blocked.</p>
        <RecordingLanguageField value={recordingLanguage} onChange={setRecordingLanguage} suggestions={languages} label="Language spoken in the new recording" />
        <FileDropZone file={file} accept="audio/wav,audio/mpeg,audio/mp4,.wav,.mp3,.m4a" disabled={busy} onFile={(next) => { setFile(next); setError("") }} hint="WAV, MP3 or M4A · up to 10 MB" />
      </section>}
      {!requiresUpload && <section className="voice-complete-source">
        <h3>Reference recording</h3>
        <p>Every model version queued below will use this exact source recording. Existing bindings remain untouched.</p>
        {profile && profile.references.length > 1 ? <label><span>Source for these model versions</span><Select value={referenceId} onValueChange={(next) => { setReferenceId(next); const reference = profile.references.find((item) => item.id === next); setRecordingLanguage(reference?.source_language || "") }}><SelectTrigger aria-label="Source for these model versions"><SelectValue /></SelectTrigger><SelectContent>{profile.references.map((reference) => <SelectItem value={reference.id} key={reference.id}>{reference.original_name || reference.id} · {reference.source_language || "language not recorded"}</SelectItem>)}</SelectContent></Select></label> : <div><b>{selectedReference?.original_name || selectedReference?.id}</b><small>{selectedReference?.source_language || "Recording language not recorded"}</small></div>}
      </section>}
      <div className="voice-complete-routes">{missing.map((route) => <div key={route.provider_model_id}><span><b>{route.role}</b><small>{route.provider} · {route.label} · {route.region} · {route.documented_output_languages.length} documented output languages</small></span><em>{route.estimated_creation_cost ? `up to $${route.estimated_creation_cost.toFixed(2)}` : "Free creation"}</em></div>)}</div>
      {error && <p className="voice-create-error">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !missing.length || (requiresUpload ? (!file || !recordingLanguage) : !referenceId)} onClick={() => void complete()}>{busy ? <><LoaderCircle className="spin" /> Preparing…</> : <><Sparkles /> Create {missing.length} model version{missing.length === 1 ? "" : "s"}</>}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
