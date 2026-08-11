import { AudioLines, CheckCircle2, MoreHorizontal, Pause, Pencil, Play, Plus, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { languageDisplay, languageFlag } from "@/lib/voice"
import { VoiceCapabilityList } from "./voice-capability-list"
import { bindingMatchesRoute, jobMatchesRoute } from "./voice-route"
import type { VoiceProfile } from "@/types/domain"

export function VoiceProfileCard({ profile, playing = false, onComplete, onRetry, onEdit, onPreview }: {
  profile: VoiceProfile
  playing?: boolean
  onComplete: () => void
  onRetry: (enrollmentJobId: string) => void
  onEdit: () => void
  onPreview: () => void
}) {
  const ready = profile.available_routes.filter((route) => profile.bindings.some((binding) => bindingMatchesRoute(binding, route))).length
  const active = profile.jobs.some((job) => ["queued", "creating"].includes(job.status))
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const editorialLanguage = String(profile.metadata.editorial_language || "")
  const image = String(profile.metadata.image || "")
  const usage = profile.usage
  const canPreview = Boolean(usage?.preview_filename)
  const preferredReference = profile.references.find((reference) => reference.id === profile.preferred_reference_id) || profile.references[0]
  const sourceAvailable = Boolean(preferredReference?.id)
  const missingForPreferred = profile.available_routes.filter((route) =>
    !profile.bindings.some((binding) => binding.reference_id === preferredReference?.id && bindingMatchesRoute(binding, route)) &&
    !profile.jobs.some((job) => job.reference_id === preferredReference?.id && jobMatchesRoute(job, route))).length
  const readyLabel = `${ready} of ${profile.available_routes.length} installed provider models · ${profile.bindings.length} exact binding${profile.bindings.length === 1 ? "" : "s"}`
  return <article className="voice-profile-card">
    <header><span className="voice-profile-mark">{image ? <img src={image} alt="" /> : initials || <AudioLines />}</span><div><small>{profile.metadata.favourite && <Star />} Your voice{editorialLanguage ? ` · ${languageFlag(editorialLanguage)} ${languageDisplay(editorialLanguage)} focus` : " · no casting tag"}</small><h2>{profile.name}</h2><p>{profile.metadata.trait || "No voice notes yet"}</p></div><div className="voice-profile-actions"><span className="voice-profile-count">{readyLabel}</span><Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${profile.name}`}><MoreHorizontal /></Button></div></header>
    <div className="voice-profile-facts"><span><b>{usage?.uses || 0}</b> uses</span><span><b>{usage?.productions || 0}</b> productions</span>{profile.metadata.accent && <span>{String(profile.metadata.accent)}</span>}{profile.metadata.gender && <span>{String(profile.metadata.gender)}</span>}</div>
    <VoiceCapabilityList routes={profile.available_routes} bindings={profile.bindings} jobs={profile.jobs} references={profile.references} sourceAvailable={sourceAvailable} onRetry={onRetry} />
    <footer><div className="voice-profile-footer-copy"><span>{preferredReference?.original_name ? `Preferred reference · ${preferredReference.original_name}` : "Historical provider binding · reference audio not preserved"}</span>{profile.references.length > 1 && <span>{profile.references.length} saved references</span>}{active ? <span className="voice-profile-working"><i /> Building provider bindings</span> : missingForPreferred > 0 ? <Button variant="outline" onClick={onComplete}><Plus /> {sourceAvailable ? `Create ${missingForPreferred} binding${missingForPreferred === 1 ? "" : "s"} for preferred reference` : `Add reference for ${missingForPreferred} provider model${missingForPreferred === 1 ? "" : "s"}`}</Button> : <span className="voice-profile-complete"><CheckCircle2 /> Preferred reference covers every installed model</span>}</div><div className="voice-profile-footer-actions"><Button variant="outline" size="sm" disabled={!canPreview} onClick={onPreview}>{playing ? <Pause /> : <Play />} {canPreview ? "Preview" : "No sample"}</Button><Button variant="ghost" size="sm" onClick={onEdit}><Pencil /> Edit</Button></div></footer>
  </article>
}
