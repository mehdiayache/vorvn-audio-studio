import { lazy, Suspense } from "react"
import {
  BrowserRouter, Navigate, Route, Routes, useLocation, useParams,
} from "react-router-dom"

import { AppShell, type AudioStudioMountMode } from "@/components/app-shell"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { ProductReadinessProvider } from "@/design-system/vorvn"
import { useHierarchy } from "@/hooks/use-hierarchy"
import { useProduction } from "@/hooks/use-production"
import { useStudioResources } from "@/hooks/use-studio-resources"
import { useProjectOverview, useSeriesOverview, useVentureOverview } from "@/hooks/use-work-overview"
import { normalizeStudioLocation } from "@/lib/routes"
import type { ResourceType } from "@/types/domain"

const VoicesPage = lazy(() => import("@/features/voices/voices-page").then((module) => ({ default: module.VoicesPage })))
const ActivityPage = lazy(() => import("@/features/activity/activity-page").then((module) => ({ default: module.ActivityPage })))
const SettingsPage = lazy(() => import("@/features/settings/settings-page").then((module) => ({ default: module.SettingsPage })))
const SpeakPage = lazy(() => import("@/features/speak/speak-page").then((module) => ({ default: module.SpeakPage })))
const SubtitlesPage = lazy(() => import("@/features/subtitles/subtitles-page").then((module) => ({ default: module.SubtitlesPage })))
const BatchPage = lazy(() => import("@/features/batch/batch-page").then((module) => ({ default: module.BatchPage })))
const ProductionPage = lazy(() => import("@/features/production/production-page").then((module) => ({ default: module.ProductionPage })))
const ProjectPage = lazy(() => import("@/features/work/project-page").then((module) => ({ default: module.ProjectPage })))
const SeriesPage = lazy(() => import("@/features/work/series-page").then((module) => ({ default: module.SeriesPage })))
const VentureDirectoryPage = lazy(() => import("@/features/work/venture-directory-page").then((module) => ({ default: module.VentureDirectoryPage })))
const VenturePage = lazy(() => import("@/features/work/venture-page").then((module) => ({ default: module.VenturePage })))

function ProductionRoute({ productionId }: { productionId: number }) {
  const { production, tree, music, refresh } = useProduction(productionId)
  const resources = useStudioResources(productionId)
  const data = production.data
  return <>
    {production.status === "loading" && !data && <PageLoading />}
    {!data && production.status === "error" && <ErrorState message={production.error || "Unable to load Production."} retry={() => void refresh()} />}
    {data && tree.status === "error" && <InlineResourceError message={`Production explorer unavailable: ${tree.error}`} retry={() => void refresh()} />}
    {data && music.status === "error" && <InlineResourceError message={`Music settings unavailable: ${music.error}`} retry={() => void refresh()} />}
    {data && resources.assetError && <InlineResourceError message={`Asset library unavailable: ${resources.assetError}`} retry={() => void resources.refreshAssets().catch(() => undefined)} />}
    {data && resources.voiceError && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void resources.refreshVoices()} />}
    {data && <LazyRoute label="Loading Production workspace"><ProductionPage production={data} tree={tree.data || null} music={music.data || {}} assets={resources.assets} assetCollections={resources.assetCollections} config={resources.config} directory={resources.voiceDirectory} refresh={refresh} refreshAssets={resources.refreshAssets} /></LazyRoute>}
  </>
}

function HomeRoute() {
  const hierarchy = useHierarchy()
  return <>
    {hierarchy.status === "loading" && !hierarchy.data && <PageLoading label="Loading Work" />}
    {hierarchy.status === "error" && !hierarchy.data && <ErrorState title="Ventures unavailable" message={hierarchy.error || "Unable to load Ventures."} retry={() => void hierarchy.refresh()} />}
    {hierarchy.data && <LazyRoute label="Loading Work"><VentureDirectoryPage items={hierarchy.data} /></LazyRoute>}
  </>
}

function VentureRoute({ id }: { id: number }) {
  const overview = useVentureOverview(id)
  return <>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Venture" />}{overview.status === "error" && !overview.data && <ErrorState title="Venture unavailable" message={overview.error || "Unable to load this Venture."} retry={overview.refresh} />}{overview.data && <LazyRoute label="Loading Venture"><VenturePage data={overview.data} refresh={overview.refresh} /></LazyRoute>}</>
}

function ProjectRoute({ id }: { id: number }) {
  const overview = useProjectOverview(id)
  return <>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Project" />}{overview.status === "error" && !overview.data && <ErrorState title="Project unavailable" message={overview.error || "Unable to load this Project."} retry={overview.refresh} />}{overview.data && <LazyRoute label="Loading Project"><ProjectPage data={overview.data} refresh={overview.refresh} /></LazyRoute>}</>
}

function SeriesRoute({ id }: { id: number }) {
  const overview = useSeriesOverview(id)
  return <>{overview.status === "loading" && !overview.data && <PageLoading label="Loading Series" />}{overview.status === "error" && !overview.data && <ErrorState title="Series unavailable" message={overview.error || "Unable to load this Series."} retry={overview.refresh} />}{overview.data && <LazyRoute label="Loading Series"><SeriesPage data={overview.data} refresh={overview.refresh} /></LazyRoute>}</>
}

function ResourceRoute({ type }: { type: ResourceType }) {
  const { identifier = "" } = useParams()
  const hierarchy = useHierarchy()
  const numericIdentifier = /^\d+$/.test(identifier) ? Number(identifier) : null
  const node = hierarchy.data?.find((item) => item.type === type && (
    numericIdentifier !== null ? item.id === numericIdentifier : item.public_id === identifier
  ))
  if (!node) {
    if (hierarchy.status === "loading") return <PageLoading label={`Loading ${type}`} />
    return <ErrorState title={`${type[0]?.toUpperCase()}${type.slice(1)} unavailable`} message={hierarchy.error || `That ${type} does not exist.`} retry={hierarchy.refresh} />
  }
  if (type === "production") return <ProductionRoute productionId={node.id} />
  if (type === "venture") return <VentureRoute id={node.id} />
  if (type === "project") return <ProjectRoute id={node.id} />
  return <SeriesRoute id={node.id} />
}

function LazyRoute({ children, label }: { children: React.ReactNode; label: string }) {
  return <Suspense fallback={<PageLoading label={label} />}>{children}</Suspense>
}

function LegacyRedirect() {
  const location = useLocation()
  const replacement = normalizeStudioLocation(location.pathname, location.search) || "/audio-studio/"
  return <Navigate replace to={replacement} />
}

function WorkIndexRedirect() {
  const location = useLocation()
  const replacement = normalizeStudioLocation(location.pathname, location.search)
  return replacement ? <Navigate replace to={replacement} /> : <HomeRoute />
}

function AudioStudioRoutes({ mode }: { mode: AudioStudioMountMode }) {
  return (
    <Routes>
      <Route path="/studio/*" element={<LegacyRedirect />} />
      <Route path="/audio-studio" element={<AppShell mode={mode} />}>
        <Route index element={<WorkIndexRedirect />} />
        <Route path="speak" element={<LazyRoute label="Loading Speak"><SpeakPage /></LazyRoute>} />
        <Route path="voices" element={<LazyRoute label="Loading voices"><VoicesPage /></LazyRoute>} />
        <Route path="batch" element={<LazyRoute label="Loading Batch"><BatchPage /></LazyRoute>} />
        <Route path="subtitles" element={<LazyRoute label="Loading Subtitles"><SubtitlesPage /></LazyRoute>} />
        <Route path="activity" element={<LazyRoute label="Loading activity"><ActivityPage /></LazyRoute>} />
        <Route path="settings" element={<LazyRoute label="Loading settings"><SettingsPage /></LazyRoute>} />
        <Route path="ventures/:identifier" element={<ResourceRoute type="venture" />} />
        <Route path="projects/:identifier" element={<ResourceRoute type="project" />} />
        <Route path="series/:identifier" element={<ResourceRoute type="series" />} />
        <Route path="productions/:identifier" element={<ResourceRoute type="production" />} />
        <Route path="workspaces/:identifier" element={<ResourceRoute type="production" />} />
        <Route path="*" element={<ErrorState title="Page unavailable" message="That Audio Studio destination does not exist." retry={() => window.history.back()} />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/audio-studio/" />} />
    </Routes>
  )
}
export function AudioStudioSurface({ mode = "standalone" }: { mode?: AudioStudioMountMode }) {
  return <AudioStudioRoutes mode={mode} />
}

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
        <ProductReadinessProvider>
          <GlobalPlayerProvider>
            <AppErrorBoundary>
              <AudioStudioSurface />
            </AppErrorBoundary>
            <Toaster richColors position="top-right" />
          </GlobalPlayerProvider>
        </ProductReadinessProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
