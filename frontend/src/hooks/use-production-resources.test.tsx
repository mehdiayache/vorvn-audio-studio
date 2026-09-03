// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ files: vi.fn() }))
vi.mock("@/lib/api", () => ({ originsApi: api }))
vi.mock("@/hooks/use-voice-directory", () => ({
  useVoiceDirectory: () => ({ error: "voice refresh failed", config: {}, cloned: [], directory: { identities: [] }, refresh: vi.fn() }),
}))

import { useProductionResources } from "./use-production-resources"

afterEach(() => vi.clearAllMocks())

describe("useProductionResources partial refreshes", () => {
  it("preserves the file library and exposes scoped file and voice errors", async () => {
    const files = [{ id: 1, name: "Music" }]
    const folders = [{ id: 9, name: "Narration" }]
    api.files.mockResolvedValueOnce({ folders, files, production_file_ids: [1177], library_file_ids: [1188] })
    const { result } = renderHook(() => useProductionResources(7))
    expect(result.current.fileState.status).toBe("loading")
    await waitFor(() => expect(result.current.files).toEqual(files))
    expect(result.current.folders).toEqual(folders)
    expect(result.current.fileState.status).toBe("ready")

    api.files.mockRejectedValueOnce(new Error("files offline"))
    await act(async () => { await expect(result.current.refreshFiles()).rejects.toThrow("files offline") })

    expect(result.current.files).toEqual(files)
    expect(result.current.folders).toEqual(folders)
    expect(result.current.productionFileIds).toEqual([1177])
    expect(result.current.libraryFileIds).toEqual([1188])
    expect(result.current.fileState.status).toBe("error")
    expect(result.current.fileState.data?.files).toEqual(files)
    expect(result.current.fileError).toBe("files offline")
    expect(result.current.voiceError).toBe("voice refresh failed")
  })
})
