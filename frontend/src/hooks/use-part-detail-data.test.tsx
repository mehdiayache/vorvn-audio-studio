// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProductionPart } from "@/types/domain"

const api = vi.hoisted(() => ({
  takes: vi.fn(), captions: vi.fn(), transcript: vi.fn(), job: vi.fn(),
}))
vi.mock("@/lib/api", () => ({ studioApi: api }))

import { usePartDetailData } from "./use-part-detail-data"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

const part = (id: number): ProductionPart => ({ id, kind: "speech", text: `Part ${id}`, cost: 0, created_at: "", position: id })
const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

afterEach(() => vi.clearAllMocks())

describe("usePartDetailData", () => {
  it("never lets a late Part A response overwrite the open Part B", async () => {
    const takesA = deferred<{ takes: Array<{ id: number }> }>()
    const captionsA = deferred<{ transcripts: never[] }>()
    api.takes.mockImplementation((_production: number, id: number) => id === 1 ? takesA.promise : Promise.resolve({ takes: [{ id: 202 }] }))
    api.captions.mockImplementation((_production: number, id: number) => id === 1 ? captionsA.promise : Promise.resolve({ transcripts: [] }))
    let activePart: ProductionPart | null = part(1)
    const { result, rerender } = renderHook(() => usePartDetailData(7, activePart, vi.fn().mockResolvedValue(undefined)), { wrapper })
    activePart = part(2)
    rerender()
    await waitFor(() => expect(result.current.takes.map((take) => take.id)).toEqual([202]))
    await act(async () => { takesA.resolve({ takes: [{ id: 101 }] }); captionsA.resolve({ transcripts: [] }); await Promise.resolve() })
    expect(result.current.takes.map((take) => take.id)).toEqual([202])
  })
})
