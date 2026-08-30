// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ assets: vi.fn() }))
vi.mock("@/lib/api", () => ({ studioApi: api }))
vi.mock("@/hooks/use-voice-directory", () => ({
  useVoiceDirectory: () => ({ error: "voice refresh failed", config: {}, cloned: [], directory: { identities: [] }, refresh: vi.fn() }),
}))

import { useStudioResources } from "./use-studio-resources"

afterEach(() => vi.clearAllMocks())

describe("useStudioResources partial refreshes", () => {
  it("preserves the asset library and exposes scoped asset and voice errors", async () => {
    const assets = [{ id: "asset-1", name: "Music" }]
    const collections = [{ id: "collection-1", name: "Music" }]
    api.assets.mockResolvedValueOnce({ assets, collections, director_asset_ids: [1188] })
    const { result } = renderHook(() => useStudioResources(7))
    expect(result.current.assetState.status).toBe("loading")
    await waitFor(() => expect(result.current.assets).toEqual(assets))
    expect(result.current.assetState.status).toBe("ready")

    api.assets.mockRejectedValueOnce(new Error("assets offline"))
    await act(async () => { await expect(result.current.refreshAssets()).rejects.toThrow("assets offline") })

    expect(result.current.assets).toEqual(assets)
    expect(result.current.assetCollections).toEqual(collections)
    expect(result.current.directorAssetIds).toEqual([1188])
    expect(result.current.assetState.status).toBe("error")
    expect(result.current.assetState.data?.assets).toEqual(assets)
    expect(result.current.assetError).toBe("assets offline")
    expect(result.current.voiceError).toBe("voice refresh failed")
  })
})
