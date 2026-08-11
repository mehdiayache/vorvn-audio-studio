import type { VoicePackageJob, VoicePackageRoute, VoiceProfileBinding } from "@/types/domain"

export function bindingMatchesRoute(binding: VoiceProfileBinding, route: VoicePackageRoute) {
  if (binding.provider_model_id && route.provider_model_id) return binding.provider_model_id === route.provider_model_id
  return binding.provider === route.provider && binding.region === route.region && binding.model_id === route.model_id && binding.tier === route.tier
}

export function jobMatchesRoute(job: VoicePackageJob, route: VoicePackageRoute) {
  if (job.provider_model_id && route.provider_model_id) return job.provider_model_id === route.provider_model_id
  return job.provider === route.provider && job.region === route.region && job.model_id === route.model_id && job.tier === route.tier
}

export function referenceName(referenceId: string | null | undefined, references: Array<{ id: string; original_name: string }>) {
  if (!referenceId) return "Reference not recorded"
  return references.find((reference) => reference.id === referenceId)?.original_name || `Reference ${referenceId.slice(0, 8)}`
}
