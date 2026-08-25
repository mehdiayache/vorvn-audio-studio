import { Mic2, Plus, Search, Sparkles } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StudioPageHeader } from "@/components/studio-page-header"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { audioUrl, studioApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import { announceVoiceDirectoryChange } from "@/lib/voice-directory-events"
import type { HistoricalVoiceReference, VoiceProfile } from "@/types/domain"
import { CreateVoiceDialog } from "./create-voice-dialog"
import { EditVoiceDialog } from "./edit-voice-dialog"
import { useVoiceProfiles } from "./use-voice-profiles"
import { VoiceProfileCard } from "./voice-profile-card"
import { VoiceProfileDialog } from "./voice-profile-dialog"
import { bindingMatchesRoute } from "./voice-route"
import { HistoricalVoicePanel } from "./historical-voice-panel"
import "./voices-page.css"

export function VoicesPage() {
  const resources = useVoiceProfiles()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<VoiceProfile | null>(null)
  const [openProfileId, setOpenProfileId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "favourites" | "incomplete">("all")
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(() => new Set())
  const priorWorking = useRef<Map<string, boolean> | null>(null)
  const player = useGlobalPlayer()
  const activeProfiles = useMemo(() => resources.profiles.filter((profile) => profile.metadata.status !== "archived"), [resources.profiles])
  const archivedProfiles = useMemo(() => resources.profiles.filter((profile) => profile.metadata.status === "archived"), [resources.profiles])
  const openProfile = useMemo(() => resources.profiles.find((profile) => profile.id === openProfileId) || null, [openProfileId, resources.profiles])
  const shownProfiles = useMemo(() => (showArchived ? archivedProfiles : activeProfiles).filter((profile) => {
    const searchable = `${profile.name} ${profile.metadata.editorial_language || ""} ${profile.metadata.recording_language || ""} ${profile.metadata.trait || ""} ${profile.metadata.accent || ""}`.toLocaleLowerCase()
    const matchesQuery = searchable.includes(query.trim().toLocaleLowerCase())
    const matchesFilter = filter === "all" || (filter === "favourites" && Boolean(profile.metadata.favourite)) || (filter === "incomplete" && (recentlyCompleted.has(profile.id) || profile.available_routes.some((route) => !profile.bindings.some((binding) => bindingMatchesRoute(binding, route)))))
    return matchesQuery && matchesFilter
  }), [activeProfiles, archivedProfiles, filter, query, recentlyCompleted, showArchived])
  const readyBindings = useMemo(() => activeProfiles.reduce((total, profile) => total + profile.bindings.length, 0), [activeProfiles])
  const installedProviderModels = useMemo(() => new Set(
    activeProfiles.flatMap((profile) => profile.available_routes.map((route) => route.provider_model_id)),
  ).size, [activeProfiles])
  useEffect(() => {
    const current = new Map(activeProfiles.map((profile) => [profile.id, profile.jobs.some((job) => ["queued", "creating"].includes(job.status))]))
    if (priorWorking.current) {
      const completed = activeProfiles.filter((profile) => priorWorking.current?.get(profile.id) && !current.get(profile.id) && profile.available_routes.length > 0 && profile.available_routes.every((route) => profile.bindings.some((binding) => bindingMatchesRoute(binding, route))))
      if (completed.length) {
        announceVoiceDirectoryChange()
        setRecentlyCompleted((values) => new Set([...values, ...completed.map((profile) => profile.id)]))
        completed.forEach((profile) => toast.success(`${profile.name} is ready`, { description: "All compatible voice capabilities were created." }))
      }
    }
    priorWorking.current = current
  }, [activeProfiles])
  function preview(profile: VoiceProfile) {
    const filename = profile.usage?.preview_filename
    if (!filename) return
    void player.toggleSource({ key: `voice:${profile.id}`, url: audioUrl(filename), title: profile.name, subtitle: String(profile.metadata.trait || "Your cloned voice"), artwork: String(profile.metadata.image || "") || undefined, kind: "voice" })
  }
  function previewHistory(item: HistoricalVoiceReference, label: string) {
    if (!item.preview_filename) return
    void player.toggleSource({ key: `history:${item.provider_voice_id}`, url: audioUrl(item.preview_filename), title: label, subtitle: "Older cloned-voice recording", kind: "voice" })
  }
  if (resources.status === "loading" && !resources.profiles.length) return <PageLoading label="Loading voices" />
  if (resources.status === "error" && !resources.profiles.length) return <ErrorState title="Voices unavailable" message={resources.error} retry={resources.refresh} />
  return <main className="voices-page">
    <StudioPageHeader eyebrow="Voice Library" title="Your voices" description="Choose the person first. Open a voice when you need its recording methods or listening tests." actions={<Button onClick={() => setCreating(true)}><Plus /> Create voice</Button>} />
    {resources.status === "error" && resources.profiles.length > 0 && <InlineResourceError message="Voice Library refresh failed. Existing identities are preserved." retry={() => void resources.refresh()} />}
    <section className="voices-overview" aria-label="Voice summary"><span><b>{activeProfiles.length}</b> voices</span><span><b>{readyBindings}</b> ready recording methods</span><span><b>{installedProviderModels}</b> methods available</span>{Boolean(archivedProfiles.length) && <Button variant={showArchived ? "secondary" : "ghost"} size="sm" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Back to active" : `${archivedProfiles.length} archived`}</Button>}</section>
    <section className="voices-controls" aria-label="Find voices"><label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, language, trait, or accent" /></label><div role="group" aria-label="Voice filters"><Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setFilter("all")}>All</Button><Button size="sm" variant={filter === "favourites" ? "secondary" : "ghost"} onClick={() => setFilter("favourites")}>Favourites</Button><Button size="sm" variant={filter === "incomplete" ? "secondary" : "ghost"} onClick={() => setFilter("incomplete")}>Needs setup</Button></div></section>
    <section className="voice-profile-grid" aria-label={showArchived ? "Archived voices" : "Your cloned voices"}>{shownProfiles.map((profile) => <VoiceProfileCard key={profile.id} profile={profile} playing={player.source?.key === `voice:${profile.id}` && player.state === "playing"} onOpen={() => setOpenProfileId(profile.id)} onPreview={() => preview(profile)} />)}{!shownProfiles.length && (showArchived ? <div className="voices-empty"><Mic2 /><h2>No archived voices</h2><p>Archived identities stay out of casting while existing productions keep their historical reference.</p></div> : <div className="voices-empty"><Sparkles /><h2>Create one voice, not one model ID</h2><p>Add a clean recording. {productIdentity.name} will build every compatible production capability and keep them under one identity.</p><Button onClick={() => setCreating(true)}><Plus /> Create your first voice</Button></div>)}</section>
    {!showArchived && <HistoricalVoicePanel profiles={resources.profiles} onLinked={() => void resources.refresh()} onPreview={previewHistory} />}
    <CreateVoiceDialog open={creating} onOpenChange={setCreating} config={resources.config} onQueued={() => { announceVoiceDirectoryChange(); void resources.refresh() }} />
    <VoiceProfileDialog profile={openProfile} open={Boolean(openProfile)} onOpenChange={(next) => { if (!next) setOpenProfileId(null) }} onEditIdentity={() => { if (openProfile) { setEditing(openProfile); setOpenProfileId(null) } }} onChanged={() => { announceVoiceDirectoryChange(); void resources.refresh() }} />
    <EditVoiceDialog profile={editing} onOpenChange={(open) => { if (!open) setEditing(null) }} onSaved={() => { announceVoiceDirectoryChange(); void resources.refresh() }} onArchived={() => { player.close(); announceVoiceDirectoryChange(); void resources.refresh() }} />
  </main>
}
