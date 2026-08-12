import { VoiceLanguageSupport } from "@/components/voice-language-support"
import { VoiceMethodPicker } from "@/components/production-tools/voice-method-picker"
import { VoicePicker } from "@/components/voice-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { outputLanguageOptions } from "@/lib/voice-capabilities"
import { resolveSelectedRoute, routeSelection, routeSelectionId, type RouteSelection } from "@/lib/composer-contract"
import { getVoiceIdentities, routesForIdentity, type VoiceChoice } from "@/lib/voice-options"
import type { PlayerSource, StudioConfig, VoiceDirectory } from "@/types/domain"

export type RecordingSetupValue = {
  identityId: string
  route: RouteSelection | null
  language: string
}

export function resolveRecordingSetup(directory: VoiceDirectory, value: RecordingSetupValue) {
  const identities = getVoiceIdentities(directory.registry ?? null, directory.identities)
  const identity = identities.find((item) => item.identityId === value.identityId)
  const routes = routesForIdentity(identity, value.language)
  return { identities, identity, routes, route: resolveSelectedRoute(value.route, routes) }
}

export function RecordingSetup({ value, config, directory, playingKey, playerPlaying, onPlay, onChange, compact = false }: {
  value: RecordingSetupValue
  config: StudioConfig | null
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onChange: (value: RecordingSetupValue) => void
  compact?: boolean
}) {
  const resolved = resolveRecordingSetup(directory, value)
  const languageOptions = outputLanguageOptions(config, resolved.identity)
  const chooseRoute = (route: VoiceChoice, capabilityId?: string | null) => onChange({ ...value, route: routeSelection(route, capabilityId) })
  return <div className="recording-setup">
    <label><span>Voice</span><VoicePicker identities={resolved.identities} value={value.identityId} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onChange={(identity) => onChange({ ...value, identityId: identity.identityId, route: null })} /></label>
    <label><span>Output language</span><Select value={value.language} onValueChange={(language) => onChange({ ...value, language })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{languageOptions.map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select></label>
    <div className="batch-methods"><span>Exact recording method</span>{resolved.identity
      ? <VoiceMethodPicker compact={compact} routes={resolved.identity.routes} availableRoutes={resolved.routes} selectedRouteId={routeSelectionId(value.route)} selectedCapabilityId={value.route?.capabilityId || null} language={value.language} customVoice={resolved.identity.source === "mine"} config={config} onSelect={chooseRoute} />
      : <p>Choose a voice to see its ready routes.</p>}</div>
    {resolved.route && <VoiceLanguageSupport compact route={resolved.route} language={value.language} customVoice={resolved.identity?.source === "mine"} />}
    <p>{resolved.identity ? `${resolved.identity.name} has ${resolved.identity.routes.length} ready exact route(s). Changing voice clears the route; changing language never changes it.` : "No voice or route is selected automatically."}</p>
  </div>
}
