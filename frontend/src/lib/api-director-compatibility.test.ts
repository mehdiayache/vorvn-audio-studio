// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())

describe("Director compatibility API", () => {
  it("checks libraries larger than the bounded server request in batches", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { asset_ids: number[] }
      return new Response(JSON.stringify({
        data: body.asset_ids.map((asset_id) => ({
          asset_id, state: "compatible", reasons: [],
        })),
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    const assetIds = Array.from({ length: 1_001 }, (_, index) => index + 1)

    const results = await studioApi.directorInputCompatibility(7, {
      model_id: "kling-3.0-omni/text-to-video",
      operation: "text_to_video",
      parameter_key: "elements",
      variant_id: "images",
      asset_ids: assetIds,
    })

    expect(results.map(({ asset_id }) => asset_id)).toEqual(assetIds)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([, init]) => (
      JSON.parse(String((init as RequestInit).body)) as { asset_ids: number[] }
    ).asset_ids.length)).toEqual([500, 500, 1])
  })
})
