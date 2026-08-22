// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { AssetTool } from "./asset-tool"

const assets = [{ id: 11, title: "Harbor Intro", folder: "Intros", filename: "harbor.wav", duration_ms: 8_400 }]

describe("AssetTool", () => {
  it("keeps audition separate from explicit insertion", async () => {
    const onPlay = vi.fn()
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<AssetTool assets={assets} mode="sequence" playerPlaying={false} onChoose={onChoose} onPlay={onPlay} onUpload={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Audition" }))
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ key: "asset-source:11" }))
    expect(onChoose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Harbor Intro/ }))
    expect(screen.getByText(/selected, not yet placed/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Insert in Sequence" }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(assets[0]))
  })

  it("preselects the linked source when replacing an Asset Part", () => {
    render(<AssetTool assets={assets} mode="sequence" chooseLabel="Replace linked asset" initialSelectedId={11} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Replace linked asset" }).hasAttribute("disabled")).toBe(false)
  })
})
