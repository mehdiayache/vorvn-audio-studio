// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { useJobQuery } from "./use-job-query"

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/audio-studio/batch?keep=yes"]}>{children}</MemoryRouter>
}

describe("useJobQuery", () => {
  it("persists and clears a Job without deleting other route state", () => {
    const { result } = renderHook(() => {
      const job = useJobQuery("batch-job")
      const location = useLocation()
      return { job, search: location.search }
    }, { wrapper })
    act(() => result.current.job[1]("job-123", false))
    expect(result.current.job[0]).toBe("job-123")
    expect(result.current.search).toContain("keep=yes")
    act(() => result.current.job[1](null))
    expect(result.current.job[0]).toBeNull()
    expect(result.current.search).toBe("?keep=yes")
  })
})
