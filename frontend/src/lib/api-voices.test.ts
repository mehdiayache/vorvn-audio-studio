// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("generated Voice API contracts", () => {
  it("reads the bounded profile collection envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: [],
      meta: { count: 0, total: 0, next_cursor: null },
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(originsApi.voiceProfiles()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/voices?limit=100",
      expect.objectContaining({ headers: {} }),
    )
  })

  it("does not treat a cost-confirmation envelope as a created package", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { needs_confirmation: true, estimate: 0.12, warn_above: 0.1 },
    }, 202)))

    await expect(originsApi.createVoicePackage({
      confirmed: true,
      language: "en",
      name: "Test voice",
      package: "complete",
      reference_id: "reference-1",
    })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "Voice creation requires cost confirmation.",
    })
  })
})
