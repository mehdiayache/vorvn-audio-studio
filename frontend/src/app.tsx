import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import {
  BrowserRouter, Link, Navigate, Route, Routes, useParams,
} from "react-router-dom"

import { AppShell, type OriginsMountMode } from "@/components/app-shell"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/components/product-readiness"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { useProduction } from "@/hooks/use-production"
import { useProductionResources } from "@/hooks/use-production-resources"
import { originsApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"
import type { LoadState, ProjectDetail } from "@/types/domain"

const VoicesPage = lazy(() => import("@/features/voices/voices-page").then((module) => ({ default: module.VoicesPage })))
const ActivityPage = lazy(() => import("@/features/activity/activity-page").then((module) => ({ default: module.ActivityPage })))
const SettingsPage = lazy(() => import("@/features/settings/settings-page").then((module) => ({ default: module.SettingsPage })))
const AudiovisualProductionPage = lazy(() => import("@/features/productions/audiovisual/audiovisual-production-page").then((module) => ({ default: module.AudiovisualProductionPage })))
const WorkspaceExplorerPage = lazy(() => import("@/features/workspace/explorer/workspace-explorer-page").then((module) => ({ default: module.WorkspaceExplorerPage })))
const CreateCreatorPage = lazy(() => import("@/features/create/create-creator-page").then((module) => ({ default: module.CreateCreatorPage })))
const ProjectPage = lazy(() => import("@/features/projects/project-page").then((module) => ({ default: module.ProjectPage })))

function AudiovisualProductionWorkspace({ productionId }: { productionId: number }) {
  const { production, soundScene, visualScene, refresh } = useProduction(productionId)
  const resources = useProductionResources(productionId)
  const data = production.data
  const projectId = data?.project_id ?? null
  const [project, setProject] = useState<LoadState<ProjectDetail | null>>({ status: "ready", data: null })
  const projectRequest = useRef(0)
  const refreshProject = useCallback(async () => {
    const request = ++projectRequest.current
    if (!projectId) {
      setProject({ status: "ready", data: null })
      return
    }
    setProject({ status: "loading" })
    try {
      const nextProject = await originsApi.project(String(projectId))
      if (projectRequest.current === request) setProject({ status: "ready", data: nextProject })
    } catch (reason) {
      if (projectRequest.current === request) setProject({
        status: "error",
        error: reason instanceof Error ? reason.message : "Project navigation is unavailable.",
      })
    }
  }, [projectId])
  useEffect(() => { void refreshProject() }, [refreshProject])
  return <>
    {production.status === "loading" && !data && <PageLoading />}
    {!data && production.status === "error" && <ErrorState message={production.error || "Unable to load Production."} retry={() => void refresh()} />}
    {data && soundScene.status === "error" && <InlineResourceError message={`Timeline unavailable: ${soundScene.error}`} retry={() => void refresh()} />}
    {data && visualScene.status === "error" && <InlineResourceError message={`Visual timeline unavailable: ${visualScene.error}`} retry={() => void refresh()} />}
    {data && resources.fileError && resources.fileState.data && <InlineResourceError message={`File library refresh failed: ${resources.fileError}`} retry={() => void resources.refreshFiles().catch(() => undefined)} />}
    {data && resources.voiceError && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void resources.refreshVoices()} />}
    {data?.project_id && project.status === "error" && <InlineResourceError message={`Project navigation unavailable: ${project.error}`} retry={() => void refreshProject()} />}
    {data && soundScene.data && visualScene.data && <LazyRoute label="Loading Production workspace"><AudiovisualProductionPage production={data} project={project.data || null} soundScene={soundScene.data} visualScene={visualScene.data} folders={resources.folders} files={resources.files} productionFileIds={resources.productionFileIds} libraryFileIds={resources.libraryFileIds} fileState={resources.fileState} config={resources.config} directory={resources.voiceDirectory} refresh={refresh} refreshFiles={resources.refreshFiles} /></LazyRoute>}
  </>
}

function WorkspaceExplorerRoute({ view = "home" }: { view?: "workspaces" | "home" | "projects" | "productions" | "files" | "explorer" }) {
  return <LazyRoute label="Opening your Workspace"><WorkspaceExplorerPage view={view} /></LazyRoute>
}

function WorkspacePlaceholder({ title, description, existingAction }: {
  title: string
  description: string
  existingAction?: { href: string; label: string }
}) {
  return <main className="workspace-shell-placeholder" aria-labelledby="workspace-placeholder-title">
    <p>Workspace</p>
    <h1 id="workspace-placeholder-title">{title}</h1>
    <span>{description}</span>
    {existingAction && <Link to={existingAction.href}>{existingAction.label}</Link>}
  </main>
}

function AudiovisualProductionRoute() {
  const { identifier = "" } = useParams()
  const [state, setState] = useState<{ id?: number; error?: string }>({})
  useEffect(() => {
    let active = true
    setState({})
    void originsApi.production(identifier).then((production) => {
      if (active) setState({ id: production.id })
    }).catch((error) => {
      if (active) setState({ error: error instanceof Error ? error.message : "Unable to open this Production." })
    })
    return () => { active = false }
  }, [identifier])
  if (state.id) return <AudiovisualProductionWorkspace productionId={state.id} />
  if (state.error) return <ErrorState title="Production unavailable" message={state.error} retry={() => window.location.reload()} />
  return <PageLoading label="Opening audiovisual Production" />
}

function LazyRoute({ children, label }: { children: React.ReactNode; label: string }) {
  return <Suspense fallback={<PageLoading label={label} />}>{children}</Suspense>
}

function OriginsRoutes({ mode }: { mode: OriginsMountMode }) {
  return (
    <Routes>
      <Route path="/origins" element={<AppShell mode={mode} />}>
        <Route index element={<WorkspaceExplorerRoute view="workspaces" />} />
        <Route path="home" element={<WorkspaceExplorerRoute />} />
        <Route path="create" element={<Navigate replace to="/origins/create/generate-image" />} />
        <Route path="create/:actionId" element={<LazyRoute label="Opening Create"><CreateCreatorPage /></LazyRoute>} />
        <Route path="projects" element={<WorkspaceExplorerRoute view="projects" />} />
        <Route path="projects/:identifier" element={<LazyRoute label="Opening Project"><ProjectPage /></LazyRoute>} />
        <Route path="explorer" element={<WorkspaceExplorerRoute view="explorer" />} />
        <Route path="productions" element={<WorkspaceExplorerRoute view="productions" />} />
        <Route path="productions/audiovisual/:identifier" element={<AudiovisualProductionRoute />} />
        <Route path="library" element={<WorkspaceExplorerRoute view="files" />} />
        <Route path="files" element={<WorkspaceExplorerRoute view="files" />} />
        <Route path="objects" element={<WorkspacePlaceholder title="Objects" description="Reusable Brands, Voices, Citizens and Products will live here. This cut adds navigation only." existingAction={{ href: "/origins/voices", label: "Open Voices" }} />} />
        <Route path="add" element={<WorkspacePlaceholder title="Add" description="Bring resources into this Workspace. The universal Add flow will arrive in its dedicated cut." />} />
        <Route path="tools" element={<WorkspacePlaceholder title="Tools" description="Transform existing Workspace Files. The universal Tools flow will arrive in its dedicated cut." existingAction={{ href: "/origins/create/create-subtitles", label: "Open Subtitles" }} />} />
        <Route path="voices" element={<LazyRoute label="Loading voices"><VoicesPage /></LazyRoute>} />
        <Route path="activity" element={<LazyRoute label="Loading activity"><ActivityPage /></LazyRoute>} />
        <Route path="settings" element={<LazyRoute label="Loading settings"><SettingsPage /></LazyRoute>} />
        <Route path="*" element={<ErrorState title="Page unavailable" message={`That ${productIdentity.name} destination does not exist.`} retry={() => window.history.back()} />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/origins/" />} />
    </Routes>
  )
}
export function OriginsSurface({ mode = "standalone" }: { mode?: OriginsMountMode }) {
  return <OriginsRoutes mode={mode} />
}

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
        <ProductReadinessProvider>
          <GlobalPlayerProvider>
            <AppErrorBoundary>
              <OriginsSurface />
            </AppErrorBoundary>
            <Toaster />
          </GlobalPlayerProvider>
        </ProductReadinessProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
