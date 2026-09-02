// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { originsApi } from "@/lib/api"

afterEach(() => vi.unstubAllGlobals())

describe("Media compatibility API", () => {
  it("checks libraries larger than the bounded server request in batches", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { file_ids: number[] }
      return new Response(JSON.stringify({
        data: body.file_ids.map((file_id) => ({
          file_id, state: "compatible", reasons: [],
        })),
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    const fileIds = Array.from({ length: 1_001 }, (_, index) => index + 1)

    const results = await originsApi.mediaInputCompatibility({ workspace_id: 3, project_id: 7, project_type: "audiovisual" }, {
      model_id: "kling-3.0-omni/text-to-video",
      operation: "text_to_video",
      parameter_key: "elements",
      variant_id: "images",
      file_ids: fileIds,
    })

    expect(results.map(({ file_id }) => file_id)).toEqual(fileIds)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([, init]) => (
      JSON.parse(String((init as RequestInit).body)) as { file_ids: number[] }
    ).file_ids.length)).toEqual([500, 500, 1])
  })
})
