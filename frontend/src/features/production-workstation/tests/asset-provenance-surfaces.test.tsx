// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AudioAssetCard } from "@/components/audio-asset-card"
import { SavedAudioInspector } from "@/components/production-tools/audio-library-inspector"
import { assetProvenance } from "@/lib/asset-provenance"
import type { VentureAsset } from "@/types/domain"
import { VisualAssetCard } from "../director/visual-asset-card"
import { TimelineMediaBrowser } from "../timeline/timeline-workbench"

afterEach(cleanup)

const fixtures: Array<[string, VentureAsset]> = [
  ["Stable Audio", { id: 1, media_type: "image", name: "Stable", filename: "stable.png", metadata: { origin: "generated", provider_id: "ai.vrn.one", model: "stable-audio-3-small-music" } }],
  ["Kling version metadata", { id: 2, media_type: "image", name: "Kling", filename: "kling.png", version_metadata: { origin: "director-generation", provider_id: "kie", provider_model_id: "kling-3.0-omni" } }],
  ["Freesound", { id: 3, media_type: "image", name: "Freesound", filename: "freesound.png", metadata: { origin: "freesound", creator: "Field Recordist" } }],
  ["uploaded", { id: 4, media_type: "image", name: "Upload", filename: "upload.png", metadata: { origin: "uploaded", original_filename: "source.png" } }],
  ["unknown legacy", { id: 5, media_type: "image", name: "Legacy", filename: "legacy.png", metadata: {} }],
  ["second generator", { id: 6, media_type: "image", name: "Wan", filename: "wan.png", metadata: { origin: "generated", provider: "alibaba", provider_model_id: "wan-2.6" } }],
]

function sourceContract(container: HTMLElement) {
  const marker = container.querySelector<HTMLElement>("[data-asset-source]")
  return {
    source: marker?.dataset.assetSource,
    label: marker?.dataset.sourceLabel,
    accessibleName: marker?.getAttribute("aria-label"),
  }
}

describe("Asset provenance surface contract", () => {
  it.each(fixtures)("keeps Audio Library, Director and Timeline aligned for %s", (_name, asset) => {
    const expected = assetProvenance(asset)
    const expectedContract = {
      source: expected.source,
      label: expected.presentation.label,
      accessibleName: `${expected.presentation.label} source`,
    }

    const audio = render(<AudioAssetCard asset={asset} />)
    expect(sourceContract(audio.container)).toEqual(expectedContract)
    audio.unmount()

    const director = render(<VisualAssetCard asset={asset} onPreview={vi.fn()} />)
    expect(sourceContract(director.container)).toEqual(expectedContract)
    director.unmount()

    const timeline = render(<TimelineMediaBrowser
      assets={[asset]}
      productionAssetIds={[asset.id]}
      usedAssetIds={[]}
      collapsed={false}
      onCollapsedChange={vi.fn()}
      onPreview={vi.fn()}
      onAdd={vi.fn()}
    />)
    expect(sourceContract(timeline.container)).toEqual(expectedContract)
  })

  it("reads immutable provider details in the saved Asset inspector without inventing an Auvi provider", () => {
    const kling = fixtures[1]![1]
    const { container, getByText } = render(<SavedAudioInspector asset={{ ...kling, media_type: "audio" }} title="Kling audio" onSave={vi.fn()} />)
    expect(getByText("kie")).toBeTruthy()
    expect(getByText("kling-3.0-omni")).toBeTruthy()
    expect(container.textContent).not.toContain("VORVN Audio")
    expect(container.textContent).not.toContain("ai.vrn.one")
  })
})
