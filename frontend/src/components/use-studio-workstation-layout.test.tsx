// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useStudioWorkstationLayout } from "./use-studio-workstation-layout"

beforeEach(() => localStorage.clear())
afterEach(cleanup)

function pointer(target: HTMLButtonElement, clientY: number, pointerId = 1) {
  return { currentTarget: target, clientY, pointerId, button: 0, preventDefault: vi.fn() } as unknown as ReactPointerEvent<HTMLButtonElement>
}
function handle(height = 900) {
  const parent = document.createElement("section")
  Object.defineProperty(parent, "clientHeight", { value: height, configurable: true })
  const target = document.createElement("button")
  target.setPointerCapture = vi.fn()
  target.releasePointerCapture = vi.fn()
  parent.append(target)
  return { parent, target }
}

describe("Studio workstation layout", () => {
  it("restores each supplied scope without overwriting the next scope with previous values", () => {
    localStorage.setItem("workspace:a", JSON.stringify({ workbenchHeight: 400, browserCollapsed: true }))
    localStorage.setItem("workspace:b", JSON.stringify({ workbenchHeight: 260, browserCollapsed: false }))
    const { result, rerender } = renderHook(({ storageKey }) => useStudioWorkstationLayout({ storageKey }), { initialProps: { storageKey: "workspace:a" } })
    expect(result.current.workbenchHeight).toBe(400)
    expect(result.current.browserCollapsed).toBe(true)
    act(() => result.current.setWorkbenchHeight(480))
    rerender({ storageKey: "workspace:b" })
    expect(result.current.workbenchHeight).toBe(260)
    expect(result.current.browserCollapsed).toBe(false)
    expect(JSON.parse(localStorage.getItem("workspace:a")!).workbenchHeight).toBe(480)
    expect(JSON.parse(localStorage.getItem("workspace:b")!).workbenchHeight).toBe(260)
  })

  it("keeps pointer drafts out of storage and commits the final bounded height on release", () => {
    const { result } = renderHook(() => useStudioWorkstationLayout({ storageKey: "layout" }))
    const { target } = handle(700)
    act(() => result.current.begin(pointer(target, 100)))
    act(() => result.current.move(pointer(target, 180)))
    expect(result.current.workbenchHeight).toBe(440)
    expect(JSON.parse(localStorage.getItem("layout")!).workbenchHeight).toBe(360)
    act(() => result.current.end(pointer(target, 500)))
    expect(result.current.workbenchHeight).toBe(470)
    expect(JSON.parse(localStorage.getItem("layout")!).workbenchHeight).toBe(470)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it.each(["escape", "blur", "pointercancel"])("restores a resized draft on %s", mode => {
    const { result } = renderHook(() => useStudioWorkstationLayout({ storageKey: "layout" }))
    const { target } = handle()
    act(() => result.current.begin(pointer(target, 100)))
    act(() => result.current.move(pointer(target, 200)))
    expect(result.current.workbenchHeight).toBe(460)
    act(() => {
      if (mode === "escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }))
      else if (mode === "blur") window.dispatchEvent(new Event("blur"))
      else result.current.cancel()
    })
    expect(result.current.workbenchHeight).toBe(360)
    expect(JSON.parse(localStorage.getItem("layout")!).workbenchHeight).toBe(360)
    act(() => result.current.end(pointer(target, 200)))
    expect(result.current.workbenchHeight).toBe(360)
  })

  it("clamps mounted responsive geometry and ignores another pointer", () => {
    const { result } = renderHook(() => useStudioWorkstationLayout({ storageKey: "layout" }))
    const { parent, target } = handle(500)
    act(() => result.current.containerRef(parent))
    expect(result.current.workbenchHeight).toBe(270)
    act(() => result.current.begin(pointer(target, 100)))
    act(() => result.current.move(pointer(target, 0, 2)))
    expect(result.current.workbenchHeight).toBe(270)
    act(() => result.current.move(pointer(target, 0)))
    expect(result.current.workbenchHeight).toBe(220)
    act(() => result.current.end(pointer(target, 0)))
    Object.defineProperty(parent, "clientHeight", { value: 400 })
    act(() => window.dispatchEvent(new Event("resize")))
    expect(result.current.workbenchHeight).toBe(170)
  })

  it("tolerates malformed and unavailable optional storage", () => {
    localStorage.setItem("layout", "null")
    const { result } = renderHook(() => useStudioWorkstationLayout({ storageKey: "layout" }))
    expect(result.current.workbenchHeight).toBe(360)
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied") })
    act(() => result.current.setBrowserCollapsed(true))
    expect(result.current.browserCollapsed).toBe(true)
    setItem.mockRestore()
  })
})
