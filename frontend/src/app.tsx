import { AppShell } from "@/components/app-shell"
import { ErrorState, PageLoading } from "@/components/state-panel"
import { Toaster } from "@/components/ui/sonner"
import { lazy, Suspense, useEffect, useState } from "react"
import { studioApi } from "@/lib/api"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProductionPage } from "@/features/production/production-page"
import { ProjectPage } from "@/features/work/project-page"
import { SeriesPage } from "@/features/work/series-page"
import { VentureDirectoryPage } from "@/features/work/venture-directory-page"
import { VenturePage } from "@/features/work/venture-page"
import { useHierarchy } from "@/hooks/use-hierarchy"
import { useProduction } from "@/hooks/use-production"
import { useStudioResources } from "@/hooks/use-studio-resources"
import { useProjectOverview, useSeriesOverview, useVentureOverview } from "@/hooks/use-work-overview"
import { normalizeStudioLocation, studioRouteFromLocation } from "@/lib/routes"

const VoicesPage = lazy(() => import("@/features/voices/voices-page").then((module) => ({ default: module.VoicesPage })))
const ActivityPage = lazy(() => import("@/features/activity/activity-page").then((module) => ({ default: module.ActivityPage })))
const SettingsPage = lazy(() => import("@/features/settings/settings-page").then((module) => ({ default: module.SettingsPage })))
const SpeakPage = lazy(() => import("@/features/speak/speak-page").then((module) => ({ default: module.SpeakPage })))
const SubtitlesPage = lazy(() => import("@/features/subtitles/subtitles-page").then((module) => ({ default: module.SubtitlesPage })))
const BatchPage = lazy(() => import("@/features/batch/batch-page").then((module) => ({ default: module.BatchPage })))

function currentRoute() {
  const normalized = normalizeStudioLocation(window.location.pathname, window.location.search)
  if (normalized) window.history.replaceState({}, "", normalized)
  return studioRouteFromLocation(window.location.pathname, window.location.search)
}

function ProductionRoute({ productionId }: { productionId: number }) {
  const { production, tree, music, refresh } = useProduction(productionId)
  const resources = useStudioResources(productionId)
  const data = production.data

  return <AppShell providerConfigured={resources.config?.has_key}>
    {production.status === "loading" && !data && <PageLoading />}
    {!data && production.status === "error" && <ErrorState message={production.error || "Unable to load Production."} retry={() => void refresh()} />}
    {data && <ProductionPage production={data} tree={tree.status === "ready" ? tree.data : null} music={music.data || {}} assets={resources.assets} assetCollections={resources.assetCollections} config={resources.config} clonedVoices={resources.cloned} directory={resources.voiceDirectory} refresh={refresh} refreshAssets={resources.refreshAssets} />}
  </AppShell>
}

function HomeRoute() {
  const hierarchy = useHierarchy()
  const [configured, setConfigured] = useState<boolean | "unavailable" | undefined>()
  useEffect(() => { void studioApi.config().then((config) => setConfigured(config.has_key)).catch(() => setConfigured("unavailable")) }, [])
  return <AppShell providerConfigured={configured}>
    {hierarchy.status === "loading" && !hierarchy.data && <PageLoading />}
    {hierarchy.status === "error" && !hierarchy.data && <ErrorState title="Ventures unavailable" message={hierarchy.error || "Unable to load Ventures."} retry={() => void hierarchy.refresh()} />}
    {hierarchy.data && <VentureDirectoryPage ventures={hierarchy.data.filter((node) => node.type === "venture")} />}
  </AppShell>
}

function useConfigured() {
  const [configured, setConfigured] = useState<boolean | "unavailable" | undefined>()
  useEffect(() => { void studioApi.config().then((config) => setConfigured(config.has_key)).catch(() => setConfigured("unavailable")) }, [])
  return configured
}

function VentureRoute({ id }: { id: number }) {
  const overview = useVentureOverview(id); const configured = useConfigured()
  return <AppShell providerConfigured={configured}>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Venture" />}{overview.status === "error" && !overview.data && <ErrorState title="Venture unavailable" message={overview.error || "Unable to load this Venture."} retry={overview.refresh} />}{overview.data && <VenturePage data={overview.data} refresh={overview.refresh} />}</AppShell>
}
function ProjectRoute({ id }: { id: number }) {
  const overview = useProjectOverview(id); const configured = useConfigured()
  return <AppShell providerConfigured={configured}>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Project" />}{overview.status === "error" && !overview.data && <ErrorState title="Project unavailable" message={overview.error || "Unable to load this Project."} retry={overview.refresh} />}{overview.data && <ProjectPage data={overview.data} refresh={overview.refresh} />}</AppShell>
}
function SeriesRoute({ id }: { id: number }) {
  const overview = useSeriesOverview(id); const configured = useConfigured()
  return <AppShell providerConfigured={configured}>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Series" />}{overview.status === "error" && !overview.data && <ErrorState title="Series unavailable" message={overview.error || "Unable to load this Series."} retry={overview.refresh} />}{overview.data && <SeriesPage data={overview.data} refresh={overview.refresh} />}</AppShell>
}
function VoicesRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading voices" />}><VoicesPage /></Suspense></AppShell>
}

function ActivityRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading activity" />}><ActivityPage /></Suspense></AppShell>
}

function SettingsRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading settings" />}><SettingsPage /></Suspense></AppShell>
}

function SpeakRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading Speak" />}><SpeakPage /></Suspense></AppShell>
}

function SubtitlesRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading Subtitles" />}><SubtitlesPage /></Suspense></AppShell>
}

function BatchRoute() {
  const configured = useConfigured()
  return <AppShell providerConfigured={configured}><Suspense fallback={<PageLoading label="Loading Batch" />}><BatchPage /></Suspense></AppShell>
}

export function App() {
  const route = currentRoute()

  return (
    <TooltipProvider delayDuration={300}>
      {route.type === "speak" ? <SpeakRoute /> : route.type === "batch" ? <BatchRoute /> : route.type === "subtitles" ? <SubtitlesRoute /> : route.type === "voices" ? <VoicesRoute /> : route.type === "activity" ? <ActivityRoute /> : route.type === "settings" ? <SettingsRoute /> : route.type === "production" ? <ProductionRoute productionId={route.id} /> : route.type === "venture" ? <VentureRoute id={route.id} /> : route.type === "project" ? <ProjectRoute id={route.id} /> : route.type === "series" ? <SeriesRoute id={route.id} /> : <HomeRoute />}
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  )
}
