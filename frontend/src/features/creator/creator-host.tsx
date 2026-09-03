import { useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react"

import type { CreatorContext } from "@/lib/api"
import { CreatorLibraryWorkspace } from "./library/creator-library-workspace"
import { CreatorCapabilityPicker } from "./panel/creator-capability-picker"
import { preloadCreatorModelCatalog } from "./creator-model-catalog"

export type CreatorCapabilityId = "image" | "video" | "speech" | "music" | "sfx"

const defaultCreatorCapabilities: readonly CreatorCapabilityId[] = ["image", "video", "speech", "music", "sfx"]

export type CreatorHostWorkspace = {
  creator: ReactNode
  library: ReactNode
  creatorDetail?: string
  libraryDetail?: string
  className?: string
  libraryActions?: ReactNode
}

export type CreatorHostSession = {
  capability: CreatorCapabilityId
  context: CreatorContext
  renderWorkspace: (workspace: CreatorHostWorkspace) => ReactNode
}

export function CreatorHost({
  context,
  initialCapability,
  allowedCapabilities = defaultCreatorCapabilities,
  creatorOpen,
  onCreatorOpenChange,
  onCapabilityChange,
  presentation = "workspace",
  libraryPaneRef,
  libraryPaneProps,
  children,
}: {
  context: CreatorContext
  initialCapability: CreatorCapabilityId
  allowedCapabilities?: readonly CreatorCapabilityId[]
  creatorOpen?: boolean
  onCreatorOpenChange?: (open: boolean) => void
  onCapabilityChange?: (capability: CreatorCapabilityId) => void
  presentation?: "workspace" | "workstation"
  libraryPaneRef?: Ref<HTMLElement>
  libraryPaneProps?: Omit<ComponentPropsWithoutRef<"main">, "children" | "className">
  children: (session: CreatorHostSession) => ReactNode
}) {
  const available = allowedCapabilities.length ? allowedCapabilities : [initialCapability]
  const [capability, setCapability] = useState<CreatorCapabilityId>(
    available.includes(initialCapability) ? initialCapability : (available[0] ?? initialCapability),
  )
  const previousInitialCapability = useRef(initialCapability)

  useEffect(() => {
    setCapability((current) => {
      const launchCapabilityChanged = previousInitialCapability.current !== initialCapability
      previousInitialCapability.current = initialCapability
      if (launchCapabilityChanged && available.includes(initialCapability)) return initialCapability
      return available.includes(current)
        ? current
        : available.includes(initialCapability) ? initialCapability : (available[0] ?? initialCapability)
    })
  }, [available, initialCapability])

  useEffect(() => {
    preloadCreatorModelCatalog(available)
  }, [available])

  const capabilityContext = useMemo<CreatorContext>(() => ({
    ...context,
    selection: {
      ...Object.fromEntries(Object.entries(context.selection || {}).filter(([key]) => (
        key !== "capability" && key !== "output_media_type"
      ))),
      capability,
      ...((capability === "image" || capability === "video")
        ? { output_media_type: capability }
        : {}),
    },
  }), [capability, context])

  const renderWorkspace = useCallback((workspace: CreatorHostWorkspace) => <CreatorLibraryWorkspace
    className={workspace.className}
    presentation={presentation}
    libraryPaneRef={libraryPaneRef}
    libraryPaneProps={libraryPaneProps}
    creatorOpen={creatorOpen}
    onCreatorOpenChange={onCreatorOpenChange}
    creatorNavigation={<CreatorCapabilityPicker
      value={capability}
      capabilities={available}
      onChange={(next) => {
        setCapability(next)
        onCapabilityChange?.(next)
      }}
    />}
    creatorDetail={workspace.creatorDetail || capability}
    libraryDetail={workspace.libraryDetail}
    libraryActions={workspace.libraryActions}
    creator={workspace.creator}
    library={workspace.library}
  />, [available, capability, creatorOpen, libraryPaneProps, libraryPaneRef, onCapabilityChange, onCreatorOpenChange, presentation])

  return children({ capability, context: capabilityContext, renderWorkspace })
}
