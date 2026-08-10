// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioApi } from "@/lib/api"
import { useComposerText } from "./use-composer-text"

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, studioApi: { ...actual.studioApi, textPass: vi.fn() } }
})

afterEach(cleanup)

describe("useComposerText text preparation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(studioApi.textPass).mockResolvedValue({
      before: "مرحبا", after: "[whispers] مرحبا", difference: [], cost: 0,
    })
  })

  it.each(["shape", "tag"] as const)("omits Production identifiers for standalone Speak %s", async (operation) => {
    const { result } = renderHook(() => useComposerText(undefined, undefined, "audio"))
    act(() => result.current.updateText("مرحبا"))
    await act(async () => { await result.current.run(operation) })

    expect(studioApi.textPass).toHaveBeenCalledWith(operation, {
      text: "مرحبا", density: "normal", engine: "audio", confirmed: false,
    })
    expect(result.current.review?.kind).toBe(operation)
  })

  it("lets standalone Speak accept the returned Tagged version locally", async () => {
    const { result } = renderHook(() => useComposerText(undefined, undefined, "audio"))
    act(() => result.current.updateText("مرحبا"))
    await act(async () => { await result.current.run("tag") })
    await act(async () => { await result.current.accept() })

    expect(result.current.view).toBe("tagged")
    expect(result.current.text).toBe("[whispers] مرحبا")
  })

  it("includes Production and Part identifiers inside a Production", async () => {
    const part = { id: 121, text: "مرحبا", text_state: "raw" } as never
    const { result } = renderHook(() => useComposerText(part, 28, "audio"))
    await act(async () => { await result.current.run("tag") })

    expect(studioApi.textPass).toHaveBeenCalledWith("tag", expect.objectContaining({
      production_id: 28, part_id: 121,
    }))
  })
})
