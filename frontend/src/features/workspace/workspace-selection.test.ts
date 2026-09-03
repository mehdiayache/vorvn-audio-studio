// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  synchronizeWorkspaceSelection, WORKSPACE_SELECTION_EVENT, WORKSPACE_STORAGE_KEY,
} from "./workspace-selection"

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe("Workspace selection", () => {
  it("synchronizes a resolved resource through the canonical storage and event boundary", () => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, "4")
    const selectionChanged = vi.fn()
    window.addEventListener(WORKSPACE_SELECTION_EVENT, selectionChanged, { once: true })

    synchronizeWorkspaceSelection(9)
    synchronizeWorkspaceSelection(9)

    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe("9")
    expect(selectionChanged).toHaveBeenCalledTimes(1)
    expect((selectionChanged.mock.calls[0]?.[0] as CustomEvent<number>).detail).toBe(9)
  })
})
