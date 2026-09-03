import { lazy, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react"

import { PageLoading } from "@/components/state-panel"
import { AudioCreator } from "./audio/audio-creator"
import { preloadAudioModelCatalog } from "./audio/audio-model-catalog"
import type { CreatorCapabilityPanelProps } from "./creator-contracts"
import type { CreatorHostSession } from "./creator-host"
import type { CreatorLibraryCreationItem } from "./library/creator-library-creation-item"
import { MediaCreator } from "./media/media-creator"

const SpeechCreator = lazy(() => import("./speech/speech-creator-page").then((module) => ({ default: module.SpeechCreatorPage })))

const creatorCapabilityLabels = {
  image: "Image",
  video: "Video",
  speech: "Speech",
  music: "Music",
  sfx: "Sound Effect",
} as const

type MediaCreatorProps = Omit<ComponentProps<typeof MediaCreator>, keyof CreatorCapabilityPanelProps | "renderLibrary" | "renderWorkspace" | "libraryDetail">
type AudioCreatorProps = Omit<ComponentProps<typeof AudioCreator>, keyof CreatorCapabilityPanelProps | "fixedCapability">

export type CreatorLibraryRenderRequest = {
  capability: CreatorHostSession["capability"]
  generatedOutputIds: Set<number>
  creationItems: CreatorLibraryCreationItem[]
}

export function creatorCapabilityLabel(capability: CreatorHostSession["capability"]) {
  return creatorCapabilityLabels[capability]
}

export function CreatorCapabilityDispatcher({
  session,
  libraryDetail,
  renderLibrary,
  mediaProps,
  audioProps,
  onResult,
  resultAction,
}: {
  session: CreatorHostSession
  libraryDetail: string
  renderLibrary: (request: CreatorLibraryRenderRequest) => ReactNode
  mediaProps: MediaCreatorProps
  audioProps: AudioCreatorProps
  onResult?: CreatorCapabilityPanelProps["onResult"]
  resultAction?: CreatorCapabilityPanelProps["resultAction"]
}) {
  const { capability, availableCapabilities, context, renderWorkspace } = session
  const [speechCreationItems, setSpeechCreationItems] = useState<CreatorLibraryCreationItem[]>([])
  const [audioCreationItems, setAudioCreationItems] = useState<CreatorLibraryCreationItem[]>([])
  const library = (generatedOutputIds = new Set<number>(), creationItems: CreatorLibraryCreationItem[] = []) => renderLibrary({
    capability,
    generatedOutputIds,
    creationItems: creationItems.map((item) => ({
      ...item,
      folderId: context.folder_id ?? null,
      productionAssociated: Boolean(context.production_id),
      searchText: item.searchText || creatorCapabilityLabel(capability),
    })),
  })

  useEffect(() => {
    preloadAudioModelCatalog(availableCapabilities)
  }, [availableCapabilities])

  if (capability === "image" || capability === "video") return <MediaCreator
    key={capability}
    {...mediaProps}
    context={context}
    onResult={onResult}
    resultAction={resultAction}
    libraryDetail={libraryDetail}
    renderLibrary={library}
    renderWorkspace={renderWorkspace}
  />

  return renderWorkspace({
    creatorDetail: creatorCapabilityLabel(capability),
    libraryDetail,
    creator: capability === "speech"
      ? <Suspense fallback={<PageLoading label="Opening speech controls" />}><SpeechCreator context={context} embedded panelOnly onResult={onResult} resultAction={resultAction} onCreationItemsChange={setSpeechCreationItems} /></Suspense>
      : <AudioCreator key={capability} {...audioProps} context={context} fixedCapability={capability} onResult={onResult} resultAction={resultAction} onCreationItemsChange={setAudioCreationItems} />,
    library: library(new Set(), capability === "speech" ? speechCreationItems : audioCreationItems),
  })
}
