import { lazy, Suspense, useState, type ComponentProps, type ReactNode } from "react"

import { PageLoading } from "@/components/state-panel"
import { AudioCreator } from "./audio/audio-creator"
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

type MediaCreatorProps = Omit<ComponentProps<typeof MediaCreator>, "context" | "renderLibrary" | "renderWorkspace" | "libraryDetail">
type AudioCreatorProps = Omit<ComponentProps<typeof AudioCreator>, "mode" | "fixedCapability">

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
  speechCallbacks,
  audioProps,
}: {
  session: CreatorHostSession
  libraryDetail: string
  renderLibrary: (request: CreatorLibraryRenderRequest) => ReactNode
  mediaProps: MediaCreatorProps
  speechCallbacks?: {
    onLibraryChange?: () => void | Promise<void>
    onCreatedFiles?: (fileIds: number[]) => void | Promise<void>
  }
  audioProps: AudioCreatorProps
}) {
  const { capability, context, renderWorkspace } = session
  const [speechCreationItems, setSpeechCreationItems] = useState<CreatorLibraryCreationItem[]>([])
  const [audioCreationItems, setAudioCreationItems] = useState<CreatorLibraryCreationItem[]>([])
  const library = (generatedOutputIds = new Set<number>(), creationItems: CreatorLibraryCreationItem[] = []) => renderLibrary({
    capability,
    generatedOutputIds,
    creationItems,
  })

  if (capability === "image" || capability === "video") return <MediaCreator
    key={capability}
    {...mediaProps}
    context={context}
    libraryDetail={libraryDetail}
    renderLibrary={library}
    renderWorkspace={renderWorkspace}
  />

  return renderWorkspace({
    creatorDetail: creatorCapabilityLabel(capability),
    libraryDetail,
    creator: capability === "speech"
      ? <Suspense fallback={<PageLoading label="Opening speech controls" />}><SpeechCreator embedded panelOnly {...speechCallbacks} onCreationItemsChange={setSpeechCreationItems} /></Suspense>
      : <AudioCreator key={capability} {...audioProps} mode="sound" fixedCapability={capability} onCreationItemsChange={setAudioCreationItems} />,
    library: library(new Set(), capability === "speech" ? speechCreationItems : audioCreationItems),
  })
}
