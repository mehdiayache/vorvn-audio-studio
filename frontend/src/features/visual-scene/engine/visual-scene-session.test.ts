import { describe, expect, it, vi } from "vitest"

import type { VentureAsset, VisualScene } from "@/types/domain"
import { VisualSceneSession } from "./visual-scene-session"

const scene = (revision = 1): VisualScene => ({ production_id: 7, revision, document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [] }, updated_at: "2026-08-27" })
const image = { id: 44, media_type: "image", name: "Harbor", filename: "harbor.jpg", width: 1600, height: 900 } as VentureAsset
const video = { id: 45, media_type: "video", name: "Harbor move", filename: "harbor.mp4", duration_ms: 12_000, width: 1920, height: 1080 } as VentureAsset

describe("VisualSceneSession", () => {
  it("places one image for five seconds without duplicating the Asset", async () => {
    const update = vi.fn(async (document, expectedRevision) => ({ ...scene(expectedRevision + 1), document }))
    const session = new VisualSceneSession(scene(), { update }, 60_000)
    await session.addImage(image, 2_000)
    const track = session.snapshot().document.tracks[0]!
    expect(track.name).toBe("Image")
    expect(track.clips[0]).toMatchObject({ asset_id: 44, start_ms: 2_000, duration_ms: 5_000, source_offset_ms: 0 })
    await session.duplicate({ trackId: track.id, clipId: track.clips[0]!.id })
    expect(session.snapshot().document.tracks[0]!.clips.map((clip) => clip.asset_id)).toEqual([44, 44])
  })

  it("retains the latest edit while an earlier save is running", async () => {
    let release: (() => void) | undefined
    const first = new Promise<void>((resolve) => { release = resolve })
    const update = vi.fn(async (document, expectedRevision) => {
      if (expectedRevision === 1) await first
      return { ...scene(expectedRevision + 1), document }
    })
    const session = new VisualSceneSession(scene(), { update }, 60_000)
    const add = session.addTrack("image")
    await Promise.resolve()
    const rename = session.renameTrack(session.snapshot().document.tracks[0]!.id, "Story visuals")
    release?.()
    await Promise.all([add, rename])
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0]?.[1]).toBe(1)
    expect(update.mock.calls[1]?.[1]).toBe(2)
    expect(session.snapshot().document.tracks[0]!.name).toBe("Story visuals")
  })

  it("keeps Image and Video tracks explicit and rejects the wrong target type", async () => {
    const update = vi.fn(async (document, expectedRevision) => ({ ...scene(expectedRevision + 1), document }))
    const session = new VisualSceneSession(scene(), { update }, 30_000)
    await session.addTrack("image")
    const imageTrack = session.snapshot().document.tracks[0]!
    expect(imageTrack.media_type).toBe("image")

    await expect(session.addVisual(video, 0, imageTrack.id)).rejects.toThrow("Choose a Video track")
    expect(session.snapshot().document.tracks).toHaveLength(1)
  })

  it("moves and trims locally, then persists one gesture commit", async () => {
    const update = vi.fn(async (document, expectedRevision) => ({ ...scene(expectedRevision + 1), document }))
    const session = new VisualSceneSession(scene(), { update }, 20_000)
    await session.addImage(image, 1_000)
    update.mockClear()
    const track = session.snapshot().document.tracks[0]!
    const ref = { trackId: track.id, clipId: track.clips[0]!.id }
    session.beginGesture()
    session.moveClip(ref, 3_000)
    session.trimClip(ref, "end", 9_000)
    expect(update).not.toHaveBeenCalled()
    await session.commitGesture()
    expect(update).toHaveBeenCalledTimes(1)
    expect(session.currentClip(ref)).toMatchObject({ start_ms: 3_000, duration_ms: 6_000 })
  })

  it("places and trims video as a non-destructive source window", async () => {
    const update = vi.fn(async (document, expectedRevision) => ({ ...scene(expectedRevision + 1), document }))
    const session = new VisualSceneSession(scene(), { update }, 30_000)
    await session.addVisual(video, 2_000)
    const track = session.snapshot().document.tracks[0]!
    const ref = { trackId: track.id, clipId: track.clips[0]!.id }
    expect(session.currentClip(ref)).toMatchObject({ start_ms: 2_000, duration_ms: 12_000, source_offset_ms: 0 })

    session.beginGesture()
    session.trimClip(ref, "start", 5_000, video)
    session.trimClip(ref, "end", 11_000, video)
    await session.commitGesture()
    expect(session.currentClip(ref)).toMatchObject({ start_ms: 5_000, duration_ms: 6_000, source_offset_ms: 3_000 })
  })

  it("splits a video placement without duplicating its source Asset", async () => {
    const update = vi.fn(async (document, expectedRevision) => ({ ...scene(expectedRevision + 1), document }))
    const session = new VisualSceneSession(scene(), { update }, 30_000)
    await session.addVisual(video, 1_000)
    const track = session.snapshot().document.tracks[0]!
    const ref = { trackId: track.id, clipId: track.clips[0]!.id }

    await session.splitVideo(ref, 5_000, video)

    const clips = session.snapshot().document.tracks[0]!.clips
    expect(clips).toHaveLength(2)
    expect(clips.map((clip) => clip.asset_id)).toEqual([45, 45])
    expect(clips[0]).toMatchObject({ start_ms: 1_000, duration_ms: 4_000, source_offset_ms: 0 })
    expect(clips[1]).toMatchObject({ start_ms: 5_000, duration_ms: 8_000, source_offset_ms: 4_000 })
  })
})
