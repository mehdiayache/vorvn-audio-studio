import { lazy, Suspense, useEffect, useState } from "react"
import {
  BrowserRouter, Navigate, Route, Routes, useParams,
} from "react-router-dom"

import { AppShell, type OriginsMountMode } from "@/components/app-shell"
import { ErrorState, InlineResourceError, PageLoading } from "@/components/state-panel"
import { AppErrorBoundary } from "@/components/app-error-boundary"
import { GlobalPlayerProvider } from "@/components/global-player-provider"
import { ProductReadinessProvider } from "@/components/product-readiness"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { useProject } from "@/hooks/use-project"
import { useProjectResources } from "@/hooks/use-project-resources"
import { originsApi } from "@/lib/api"
import { productIdentity } from "@/lib/product-identity"

const VoicesPage = lazy(() => import("@/features/voices/voices-page").then((module) => ({ default: module.VoicesPage })))
const ActivityPage = lazy(() => import("@/features/activity/activity-page").then((module) => ({ default: module.ActivityPage })))
const SettingsPage = lazy(() => import("@/features/settings/settings-page").then((module) => ({ default: module.SettingsPage })))
const AudiovisualProjectPage = lazy(() => import("@/features/projects/audiovisual/audiovisual-project-page").then((module) => ({ default: module.AudiovisualProjectPage })))
const WorkspaceExplorerPage = lazy(() => import("@/features/workspace/explorer/workspace-explorer-page").then((module) => ({ default: module.WorkspaceExplorerPage })))
const CreateCreatorPage = lazy(() => import("@/features/create/create-creator-page").then((module) => ({ default: module.CreateCreatorPage })))

function AudiovisualProjectWorkspace({ projectId }: { projectId: number }) {
  const { project, soundScene, visualScene, refresh } = useProject(projectId)
  const resources = useProjectResources(projectId)
  const data = project.data
  return <>
    {project.status === "loading" && !data && <PageLoading />}
    {!data && project.status === "error" && <ErrorState message={project.error || "Unable to load Project."} retry={() => void refresh()} />}
    {data && soundScene.status === "error" && <InlineResourceError message={`Timeline unavailable: ${soundScene.error}`} retry={() => void refresh()} />}
    {data && visualScene.status === "error" && <InlineResourceError message={`Visual timeline unavailable: ${visualScene.error}`} retry={() => void refresh()} />}
    {data && resources.fileError && resources.fileState.data && <InlineResourceError message={`File library refresh failed: ${resources.fileError}`} retry={() => void resources.refreshFiles().catch(() => undefined)} />}
    {data && resources.voiceError && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void resources.refreshVoices()} />}
    {data && soundScene.data && visualScene.data && <LazyRoute label="Loading Project workspace"><AudiovisualProjectPage project={data} soundScene={soundScene.data} visualScene={visualScene.data} files={resources.files} projectFileIds={resources.projectFileIds} libraryFileIds={resources.libraryFileIds} fileState={resources.fileState} config={resources.config} directory={resources.voiceDirectory} refresh={refresh} refreshFiles={resources.refreshFiles} /></LazyRoute>}
  </>
}

function WorkspaceExplorerRoute({ view = "create" }: { view?: "create" | "projects" | "files" }) {
  return <LazyRoute label="Opening your Workspace"><WorkspaceExplorerPage view={view} /></LazyRoute>
}

function AudiovisualProjectRoute() {
  const { identifier = "" } = useParams()
  const [state, setState] = useState<{ id?: number; error?: string }>({})
  useEffect(() => {
    let active = true
    setState({})
    void originsApi.project(identifier).then((project) => {
      if (active) setState({ id: project.id })
    }).catch((error) => {
      if (active) setState({ error: error instanceof Error ? error.message : "Unable to open this Project." })
    })
    return () => { active = false }
  }, [identifier])
  if (state.id) return <AudiovisualProjectWorkspace projectId={state.id} />
  if (state.error) return <ErrorState title="Project unavailable" message={state.error} retry={() => window.location.reload()} />
  return <PageLoading label="Opening audiovisual Project" />
}

function LazyRoute({ children, label }: { children: React.ReactNode; label: string }) {
  return <Suspense fallback={<PageLoading label={label} />}>{children}</Suspense>
}

function OriginsRoutes({ mode }: { mode: OriginsMountMode }) {
  return (
    <Routes>
      <Route path="/origins" element={<AppShell mode={mode} />}>
        <Route index element={<WorkspaceExplorerRoute />} />
        <Route path="create" element={<WorkspaceExplorerRoute />} />
        <Route path="create/:actionId" element={<LazyRoute label="Opening Create"><CreateCreatorPage /></LazyRoute>} />
        <Route path="projects" element={<WorkspaceExplorerRoute view="projects" />} />
        <Route path="projects/audiovisual/:identifier" element={<AudiovisualProjectRoute />} />
        <Route path="files" element={<WorkspaceExplorerRoute view="files" />} />
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
