import { afterEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { jobObserver } from "@/lib/job-observer"
import type { DurableJob, GeneratePayload, GenerateResult } from "@/types/domain"

const payload: GeneratePayload = {
  text: "Immediate durable handle",
  voice_identity_id: "identity-1", binding_id: "binding-1", capability_id: null, format: "mp3",
  language: "English", instruction: "", speech_mode: "exact", rate: 1,
  pitch: 1, volume: 50, seed: 0,
}

afterEach(() => { jobObserver.reset(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("speech Job API", () => {
  it("returns and registers the queued backend Job without waiting for completion", async () => {
    vi.useFakeTimers()
    const queued: DurableJob<GenerateResult> = { id: "job-from-api", type: "speech", status: "queued", progress: 0, detail: "Queued", retries: 0, result: {}, part_id: 127 }
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ data: queued }) })
    vi.stubGlobal("fetch", fetch)
    const returned = await studioApi.enqueueGenerate(payload)
    expect(returned).toEqual(queued)
    expect(returned.part_id).toBe(127)
    expect(jobObserver.getSnapshot("job-from-api")).toEqual(queued)
    expect(fetch).toHaveBeenCalledTimes(1)
    const requestBody = String(fetch.mock.calls[0]?.[1]?.body)
    expect(JSON.parse(requestBody)).toEqual(payload)
    expect(requestBody).not.toContain('"voice"')
    expect(requestBody).not.toContain('"engine"')
    expect(requestBody).not.toContain('"model"')
  })
})
