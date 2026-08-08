import { AudioLines, CheckCircle2, MoreHorizontal, Pause, Pencil, Play, Plus, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { VoiceCapabilityList } from "./voice-capability-list"
import type { VoiceProfile } from "@/types/domain"

export function VoiceProfileCard({ profile, playing = false, onComplete, onRetry, onEdit, onPreview }: {
  profile: VoiceProfile
  playing?: boolean
  onComplete: () => void
  onRetry: (modelId: string) => void
  onEdit: () => void
  onPreview: () => void
}) {
  const ready = profile.available_routes.filter((route) => profile.bindings.some((binding) => binding.model_id === route.model_id)).length
  const active = profile.jobs.some((job) => ["queued", "creating"].includes(job.status))
  const missing = profile.available_routes.length - ready - profile.jobs.filter((job) => ["queued", "creating"].includes(job.status)).length
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const languageCode = String(profile.metadata.language || "")
  const languageName = languageCode ? new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(languageCode) || languageCode : "source language"
  const image = String(profile.metadata.image || "")
  const usage = profile.usage
  const canPreview = Boolean(usage?.preview_filename)
  return <article className="voice-profile-card">
    <header><span className="voice-profile-mark">{image ? <img src={image} alt="" /> : initials || <AudioLines />}</span><div><small>{profile.metadata.favourite && <Star />} Your voice</small><h2>{profile.name}</h2><p>{profile.metadata.trait || `Recorded in ${languageName}`}</p></div><div className="voice-profile-actions"><span className="voice-profile-count"><b>{ready}</b> of {profile.available_routes.length} ready</span><Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${profile.name}`}><MoreHorizontal /></Button></div></header>
    <div className="voice-profile-facts"><span><b>{usage?.uses || 0}</b> uses</span><span><b>{usage?.productions || 0}</b> productions</span>{profile.metadata.accent && <span>{String(profile.metadata.accent)}</span>}{profile.metadata.gender && <span>{String(profile.metadata.gender)}</span>}</div>
    <VoiceCapabilityList routes={profile.available_routes} bindings={profile.bindings} jobs={profile.jobs} onRetry={onRetry} />
    <footer><div className="voice-profile-footer-copy"><span>{profile.references[0]?.original_name || "No source recording saved"}</span>{active ? <span className="voice-profile-working"><i /> Building capabilities</span> : missing > 0 ? <Button variant="outline" onClick={onComplete}><Plus /> Add {missing} missing capabilit{missing === 1 ? "y" : "ies"}</Button> : <span className="voice-profile-complete"><CheckCircle2 /> All capabilities ready</span>}</div><div className="voice-profile-footer-actions"><Button variant="outline" size="sm" disabled={!canPreview} onClick={onPreview}>{playing ? <Pause /> : <Play />} {canPreview ? "Preview" : "No sample"}</Button><Button variant="ghost" size="sm" onClick={onEdit}><Pencil /> Edit</Button></div></footer>
  </article>
}
