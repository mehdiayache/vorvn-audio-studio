import { CircleAlert, Pause, Play, Sparkles } from "lucide-react"

import { OperatorIconButton } from "@/components/operator-action"
import { VoiceGenderBadge } from "@/components/voice-gender-badge"
import type { VoiceProfile } from "@/types/domain"
import { bindingMatchesRoute } from "./voice-route"

export function VoiceProfileCard({ profile, playing = false, onOpen, onPreview }: {
  profile: VoiceProfile
  playing?: boolean
  onOpen: () => void
  onPreview: () => void
}) {
  const ready = profile.available_routes.filter((route) =>
    profile.bindings.some((binding) => binding.validation_state === "approved" && bindingMatchesRoute(binding, route))).length
  const candidates = profile.bindings.filter((binding) => binding.validation_state === "candidate").length
  const working = profile.jobs.some((job) => ["queued", "creating"].includes(job.status))
  const failed = profile.jobs.some((job) => ["failed", "interrupted"].includes(job.status))
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
  const image = String(profile.metadata.image || "")
  const canPreview = Boolean(profile.usage?.preview_filename)
  const state = working ? "Building methods" : candidates ? `${candidates} candidate${candidates === 1 ? "" : "s"} to review` : failed ? "Needs attention" : `${ready} method${ready === 1 ? "" : "s"} ready`
  return <article className="voice-profile-card" onClick={onOpen}>
    <button className="voice-card-main" type="button" aria-label={`Open ${profile.name}`}>
      <span className="voice-profile-mark">{image ? <img src={image} alt="" /> : initials}</span>
      <span className="voice-card-copy"><span className="voice-card-title"><h2>{profile.name}</h2><VoiceGenderBadge gender={profile.metadata.gender} /></span><span>{profile.metadata.trait || "Production voice"}</span><small className={failed ? "has-error" : ""}>{working ? <Sparkles className="spin" /> : failed ? <CircleAlert /> : <i />}{state}</small></span>
    </button>
    <OperatorIconButton label={playing ? `Pause ${profile.name}` : `Preview ${profile.name}`} detail={canPreview ? "Hear the most recent approved recording." : "Generate this Voice once to create a preview."} disabled={!canPreview} onClick={(event) => { event.stopPropagation(); onPreview() }}>{playing ? <Pause /> : <Play />}</OperatorIconButton>
  </article>
}
