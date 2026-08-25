// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { acceptsSoundSceneShortcut } from "./sound-scene-workspace"

describe("Sound Scene shortcut focus boundary", () => {
  it("does not steal keys from operator controls", () => {
    const slider = document.createElement("span")
    slider.setAttribute("role", "slider")
    const sliderThumb = document.createElement("span")
    slider.append(sliderThumb)
    const button = document.createElement("button")
    const input = document.createElement("input")

    expect(acceptsSoundSceneShortcut(sliderThumb)).toBe(false)
    expect(acceptsSoundSceneShortcut(button)).toBe(false)
    expect(acceptsSoundSceneShortcut(input)).toBe(false)
  })

  it("keeps precise editing shortcuts on focused timeline clips", () => {
    const clip = document.createElement("div")
    clip.setAttribute("role", "button")
    clip.dataset.soundShortcutSurface = "true"

    expect(acceptsSoundSceneShortcut(clip)).toBe(true)
    expect(acceptsSoundSceneShortcut(document.body)).toBe(true)
  })
})
