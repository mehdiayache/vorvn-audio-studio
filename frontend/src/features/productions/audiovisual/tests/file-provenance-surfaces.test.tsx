// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AudioFileCard } from "@/components/audio-file-card"
import { SavedAudioInspector } from "@/features/workspace/library/audio-library-inspector"
import { fileProvenance } from "@/lib/file-provenance"
import type { WorkspaceFile } from "@/types/domain"
import { VisualFileCard } from "../library/visual-file-card"
import { TimelineMediaBrowser } from "../timeline/timeline-workbench"

afterEach(cleanup)

const fixtures: Array<[string, WorkspaceFile]> = [
  ["Stable Audio", { id: 1, media_type: "image", name: "Stable", filename: "stable.png", metadata: { origin: "generated", provider_id: "ai.vrn.one", model: "stable-audio-3-small-music" } }],
  ["Kling version metadata", { id: 2, media_type: "image", name: "Kling", filename: "kling.png", version_metadata: { origin: "generated", provider_id: "kie", provider_model_id: "kling-3.0-omni" } }],
  ["Freesound", { id: 3, media_type: "image", name: "Freesound", filename: "freesound.png", source: "imported", metadata: { origin: "imported", provider_id: "freesound", creator: "Field Recordist" } }],
  ["uploaded", { id: 4, media_type: "image", name: "Upload", filename: "upload.png", metadata: { origin: "uploaded", original_filename: "source.png" } }],
  ["uploaded fallback", { id: 5, media_type: "image", name: "Archive", filename: "archive.png", metadata: {} }],
  ["second generator", { id: 6, media_type: "image", name: "Wan", filename: "wan.png", metadata: { origin: "generated", provider: "alibaba", provider_model_id: "wan-2.6" } }],
]

function sourceContract(container: HTMLElement) {
  const marker = container.querySelector<HTMLElement>("[data-file-source]")
  return {
    source: marker?.dataset.fileSource,
    label: marker?.dataset.sourceLabel,
    accessibleName: marker?.getAttribute("aria-label"),
  }
}

describe("File provenance surface contract", () => {
  it.each(fixtures)("keeps Workspace Library, Production Library and Timeline aligned for %s", (_name, file) => {
    const expected = fileProvenance(file)
    const expectedContract = {
      source: expected.source,
      label: expected.presentation.label,
      accessibleName: `${expected.presentation.label} source`,
    }

    const audio = render(<AudioFileCard file={file} />)
    expect(sourceContract(audio.container)).toEqual(expectedContract)
    audio.unmount()

    const productionLibrary = render(<VisualFileCard file={file} onPreview={vi.fn()} />)
    expect(sourceContract(productionLibrary.container)).toEqual(expectedContract)
    productionLibrary.unmount()

    const timeline = render(<TimelineMediaBrowser
      files={[file]}
      productionFileIds={[file.id]}
      usedFileIds={[]}
      collapsed={false}
      onCollapsedChange={vi.fn()}
      onPreview={vi.fn()}
      onAdd={vi.fn()}
    />)
    expect(sourceContract(timeline.container)).toEqual(expectedContract)
  })

  it("reads immutable provider details in the saved File inspector without inventing a provider", () => {
    const kling = fixtures[1]![1]
    const { container, getByText } = render(<SavedAudioInspector file={{ ...kling, media_type: "audio" }} title="Kling audio" onSave={vi.fn()} />)
    expect(getByText("kie")).toBeTruthy()
    expect(getByText("kling-3.0-omni")).toBeTruthy()
    expect(container.textContent).not.toContain("VORVN Audio")
    expect(container.textContent).not.toContain("ai.vrn.one")
  })
})
