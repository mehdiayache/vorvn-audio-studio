// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ config: vi.fn(), voiceRegistry: vi.fn(), voiceMeta: vi.fn(), voiceUsage: vi.fn(), voiceProfiles: vi.fn() }))
vi.mock("@/lib/api", () => ({ originsApi: api }))
vi.mock("@/lib/voice-directory-events", () => ({ listenForVoiceDirectoryChanges: () => vi.fn() }))

import { useVoiceDirectory } from "./use-voice-directory"

afterEach(() => vi.clearAllMocks())

describe("useVoiceDirectory partial refreshes", () => {
  it("keeps the last usable directory when one provider resource refresh fails", async () => {
    const config = { languages: ["English"] }
    const registry = { bindings: [] }
    const profiles = [{ id: "voice-1", name: "Voice", metadata: {}, references: [], bindings: [] }]
    api.config.mockResolvedValue(config)
    api.voiceRegistry.mockResolvedValueOnce(registry)
    api.voiceMeta.mockResolvedValue({ voices: {} })
    api.voiceUsage.mockResolvedValue({ usage: {} })
    api.voiceProfiles.mockResolvedValue(profiles)
    const { result } = renderHook(() => useVoiceDirectory())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.directory.identities).toEqual(profiles)

    api.voiceRegistry.mockRejectedValueOnce(new Error("registry offline"))
    await act(async () => { await result.current.refresh() })

    expect(result.current.directory.registry).toEqual(registry)
    expect(result.current.directory.identities).toEqual(profiles)
    expect(result.current.error).toBe("registry offline")
  })
})
