// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DirectorComposer } from "../director/composer/director-composer"

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function openOperationPicker() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /Creation type:/ }), { button: 0, ctrlKey: false })
}

describe("Director composer", () => {
  it("shows only capabilities supported by the current operation and model", async () => {
    render(<DirectorComposer uploading={false} uploadLabel="" libraryAssets={[]} />)

    expect(screen.getByRole("combobox", { name: "Aspect ratio" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Image size" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Duration" })).toBeNull()

    openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Frames to video/ }))

    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model B")
    expect(screen.getByRole("combobox", { name: "Video resolution" })).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Duration" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start frame" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "End frame" })).toBeTruthy()
  })

  it("switches to the three-image plus audio capability without leaking frame controls", async () => {
    render(<DirectorComposer uploading={false} uploadLabel="" libraryAssets={[]} />)

    openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Talking video/ }))

    expect(screen.getByRole("combobox", { name: "Choose generation model" }).textContent).toContain("Model C")
    expect(screen.getByRole("button", { name: "Character" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Voice audio" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Start frame" })).toBeNull()
  })

  it("enforces Model C reference limits while retaining its character, reference and voice roles", async () => {
    render(<DirectorComposer uploading={false} uploadLabel="" libraryAssets={[]} />)
    openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Talking video/ }))

    const files = [
      new File(["one"], "character.png", { type: "image/png" }),
      new File(["two"], "reference-a.png", { type: "image/png" }),
      new File(["three"], "reference-b.png", { type: "image/png" }),
      new File(["four"], "reference-c.png", { type: "image/png" }),
      new File(["voice"], "voice.wav", { type: "audio/wav" }),
    ]
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } })

    expect(screen.getByText("Character")).toBeTruthy()
    expect(screen.getAllByText("Reference")).toHaveLength(2)
    expect(screen.getByText("Voice audio")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("accepts 3 images and 1 audio file")
  })

  it("uses canonical Library assets as role-aware references without uploading them again", async () => {
    render(<DirectorComposer uploading={false} uploadLabel="" libraryAssets={[{
      id: 41,
      media_type: "image",
      name: "Violet horizon",
      filename: "violet.webp",
      width: 1280,
      height: 720,
    }]} />)

    openOperationPicker()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Image to video/ }))
    fireEvent.pointerDown(screen.getByRole("button", { name: "Add a reference" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Choose from Visual Library" }))
    fireEvent.click(screen.getByRole("button", { name: "Use reference" }))

    expect(screen.getByText("Source image")).toBeTruthy()
    expect(screen.getByText("Violet horizon")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Source image" })).toBeNull()
  })

  it("acknowledges submission in place and keeps every setting available for remix", async () => {
    vi.useFakeTimers()
    render(<DirectorComposer uploading={false} uploadLabel="" libraryAssets={[]} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Director prompt" }), { target: { value: "A quiet violet horizon at dawn" } })

    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }))
    expect(screen.getByText("Generating")).toBeTruthy()
    expect(screen.getByText("12%")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()

    act(() => vi.advanceTimersByTime(1_300))
    expect(screen.getByText("Prototype ready")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Preview" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remix" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add to Timeline" }).hasAttribute("disabled")).toBe(true)

    fireEvent.change(screen.getByRole("textbox", { name: "Director prompt" }), { target: { value: "Different prompt" } })
    fireEvent.click(screen.getByRole("button", { name: "Remix" }))
    expect((screen.getByRole("textbox", { name: "Director prompt" }) as HTMLTextAreaElement).value).toBe("A quiet violet horizon at dawn")
  })
})
