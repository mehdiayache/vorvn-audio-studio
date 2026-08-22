// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
    expect(screen.getByText(/selected, not yet placed/i)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Insert in Sequence" }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(assets[0]))
  })

  it("preselects the linked source when replacing an Asset Part", () => {
    render(<AssetTool assets={assets} mode="sequence" chooseLabel="Replace linked asset" initialSelectedId={11} playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Replace linked asset" }).hasAttribute("disabled")).toBe(false)
  })

  it("sends canonical classification separately from the legacy collection", async () => {
    const onUpload = vi.fn().mockResolvedValue({ id: 44, name: "Rain at dusk" })
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} />)
    fireEvent.click(within(container).getByRole("button", { name: /^Upload$/ }))
    const file = new File(["rain"], "rain_at_dusk.wav", { type: "audio/wav" })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByDisplayValue("Rain at dusk")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Ambience" }))
    fireEvent.click(screen.getByRole("button", { name: /Studio Library/ }))
    const tags = screen.getByPlaceholderText(/calm, night/)
    fireEvent.change(tags, { target: { value: "rain" } })
    fireEvent.keyDown(tags, { key: "Enter" })
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }))
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith("Stingers", {
      file, name: "Rain at dusk", category: "ambience", scope: "studio",
      tags: ["rain"],
    }))
  })

  it("prepares a dropped file without saving it immediately", () => {
    const onUpload = vi.fn()
    const { container } = render(<AssetTool assets={assets} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={onUpload} />)
    const file = new File(["room tone"], "quiet-night_room.flac", { type: "audio/flac" })

    fireEvent.drop(container.querySelector(".asset-tool")!, {
      dataTransfer: { files: [file], types: ["Files"] },
    })

    expect(screen.getByDisplayValue("Quiet night room")).toBeTruthy()
    expect(screen.getByText("quiet-night_room.flac")).toBeTruthy()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it("searches canonical names and tags and filters reusable scope", () => {
    const library = [
      { id: 21, name: "Night room", category: "ambience", scope: "venture" as const, tags: ["quiet"] },
      { id: 22, name: "Wooden knock", category: "sfx", scope: "studio" as const, tags: ["door"] },
    ]
    const { container } = render(<AssetTool assets={library} mode="sound" playerPlaying={false} onChoose={vi.fn()} onPlay={vi.fn()} onUpload={vi.fn()} />)
    const view = within(container)
    fireEvent.change(view.getByPlaceholderText(/Search name/), { target: { value: "door" } })
    expect(view.getByRole("button", { name: /Wooden knock/ })).toBeTruthy()
    expect(view.queryByRole("button", { name: /Night room/ })).toBeNull()
    fireEvent.change(view.getByPlaceholderText(/Search name/), { target: { value: "" } })
    fireEvent.click(view.getByRole("button", { name: "Studio" }))
    expect(view.getByRole("button", { name: /Wooden knock/ })).toBeTruthy()
    expect(view.queryByRole("button", { name: /Night room/ })).toBeNull()
  })
})
