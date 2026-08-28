// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DurableJob, GeneratePayload, GenerateResult, ProductionPart, SoundScene, VisualScene, VoiceDirectory } from "@/types/domain"
import { audioUrl } from "@/lib/api"
import { InlineProductionName } from "./workstation-header"
import { WorkstationAssetCard, WorkstationOutline, WorkstationSequence, WorkstationSequenceCard, workstationPartState, type WorkstationPartActions } from "./workstation-sequence"
import { TimelineWorkspace } from "@/features/production-workstation/timeline/timeline-workspace"
import { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"
import { VisualSceneSession } from "@/features/visual-scene/engine/visual-scene-session"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock
const sessions: SoundSceneSession[] = []
afterEach(() => { sessions.splice(0).forEach((session) => session.dispose()); cleanup() })

const directory = { config: null, cloned: [], meta: {}, catalog: [] } as VoiceDirectory
const musicClipId = "78af885c-aeb4-49bf-9edb-d3fc14496b2c"

function part(values: Partial<ProductionPart>): ProductionPart {
  return {
    id: 1,
    created_at: "2026-08-17T00:00:00Z",
    position: 0,
    kind: "speech",
    text: "A clear story opening.",
    cost: 0,
    duration_ms: 4_000,
    clip_id: 10,
    ...values,
  }
}

function partActions(values: Partial<WorkstationPartActions> = {}): WorkstationPartActions {
  return {
    select: vi.fn(), edit: vi.fn(), replaceAsset: vi.fn(), play: vi.fn(), captions: vi.fn(), duplicate: vi.fn(), remove: vi.fn(),
    move: vi.fn(), moveToPosition: vi.fn(), reorderToPosition: vi.fn(), retry: vi.fn(), confirm: vi.fn(), setEnabled: vi.fn(),
    editSilence: vi.fn(), addBefore: vi.fn(), isPending: vi.fn().mockReturnValue(false), ...values,
  }
}

function scene(parts: ProductionPart[], sourceDurationMs = 60_000): SoundScene {
  let cursor = 0
  const mix = { muted: false, gain: 1, fade_in_ms: 0, fade_out_ms: 0, effects: [] }
  const spans = parts.map((item) => {
    const duration = Number(item.duration_ms || 0)
    const span = { part_id: item.id, part_public_id: String(item.id), position: item.position, kind: item.kind, title: item.title || "", role: item.authored_role || "", voice_name: item.voice_name || "", filename: item.filename || "", start_ms: cursor, duration_ms: duration, silence: item.kind === "silence", missing: false, mix }
    cursor += duration
    return span
  })
  const clip = { id: musicClipId, asset_id: 9, duration_ms: null, source_offset_ms: 0, gain: .12, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, muted: false, locked: false, effects: [], anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Quiet room", filename: "bed.mp3", source_duration_ms: sourceDurationMs, resolved_start_ms: 0, resolved_duration_ms: cursor }
  const track = { id: "music", kind: "audio" as const, name: "Music", volume: 1, muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, sequence_overrides: {}, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: cursor, sequence_projection: { signature: "sequence", duration_ms: cursor, sample_rate: 48_000, spans }, tracks: [track], orphans: [] }, sequence_stem: { url: "/audio/sequence-stem.mp3", filename: "sequence-stem.mp3", duration_ms: cursor, signature: "sequence", cached: true } }
}

function sessionFor(soundScene: SoundScene, update = vi.fn().mockImplementation(async () => ({ ...soundScene, revision: soundScene.revision + 1 }))) {
  const session = new SoundSceneSession(soundScene, {
    update,
    undo: vi.fn().mockResolvedValue(soundScene),
    redo: vi.fn().mockResolvedValue(soundScene),
  })
  sessions.push(session)
  return session
}

function visualSessionFor(visualScene: VisualScene) {
  return new VisualSceneSession(visualScene, {
    update: vi.fn().mockImplementation(async (document) => ({ ...visualScene, revision: visualScene.revision + 1, document })),
  }, 60_000)
}

describe("Production Workstation", () => {
  it("renames a Production inline without introducing a settings flow", async () => {
    const rename = vi.fn().mockResolvedValue(undefined)
    render(<InlineProductionName name="Esther story" onRename={rename} />)

    fireEvent.click(screen.getByRole("button", { name: "Rename Production Esther story" }))
    const input = screen.getByRole("textbox", { name: "Production name" })
    fireEvent.change(input, { target: { value: "Esther — final story" } })
    fireEvent.blur(input)

    await waitFor(() => expect(rename).toHaveBeenCalledWith("Esther — final story"))
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Production name" })).toBeNull())
  })

  it("keeps story navigation semantic and filters drafts without inventing state", () => {
    const ready = part({ id: 1, authored_role: "Narrator" })
    const draft = part({ id: 2, position: 1, authored_role: "Esther", kind: "draft", clip_id: null, duration_ms: 0 })
    const select = vi.fn()
    const collapse = vi.fn()
    render(<WorkstationOutline parts={[ready, draft]} selectedId={ready.id} directory={directory} onSelect={select} onCollapse={collapse} />)

    fireEvent.click(screen.getByRole("button", { name: "Hide outline" }))
    expect(collapse).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: /01.*Narrator/ }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }))
    expect(screen.queryByRole("button", { name: /01.*Narrator/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /02.*Esther/ }))
    expect(select).toHaveBeenCalledWith(draft)
  })

  it("keeps playback and the canonical state visible in Outline", () => {
    const ready = part({ id: 1, authored_role: "Narrator" })
    const draft = part({ id: 2, position: 1, kind: "draft", clip_id: null, duration_ms: 0 })
    const issue = part({ id: 3, position: 2, outdated: true })
    render(<WorkstationOutline parts={[ready, draft, issue]} selectedId={null} playingKey="part:1" playerPlaying directory={directory} onSelect={vi.fn()} onCollapse={vi.fn()} />)

    const playing = screen.getByRole("button", { name: /01.*Narrator.*Playing/ })
    expect(playing.getAttribute("aria-current")).toBe("true")
    expect(workstationPartState(ready)).toBe("ready")
    expect(workstationPartState(draft)).toBe("draft")
    expect(workstationPartState(issue)).toBe("issue")
  })

  it("presents a skipped Part as a fourth operator state without losing its recording", () => {
    const skipped = part({ id: 4, position: 3, authored_role: "Guide", enabled: false, clip_id: 40, filename: "guide.mp3" })
    const setEnabled = vi.fn()
    render(<WorkstationSequenceCard part={skipped} index={3} selected={false} playing={false} liveJobs={{}} directory={directory} actions={partActions({ setEnabled })} />)

    expect(workstationPartState(skipped)).toBe("skipped")
    expect(screen.getByText("Skipped")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Include Part" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Include Part" }))
    expect(setEnabled).toHaveBeenCalledWith(skipped, true)
  })

  it("offers the original Part recording without requiring a Production export", () => {
    const recorded = part({ id: 8, filename: "narrator.wav", authored_role: "Narrator" })
    render(<WorkstationSequenceCard part={recorded} index={0} selected={false} playing={false} liveJobs={{}} directory={directory} actions={partActions()} />)

    expect(screen.getByRole("link", { name: "Download Part 01 recording" }).getAttribute("href")).toBe(audioUrl("narrator.wav"))
  })

  it("filters skipped Parts separately from readiness", () => {
    const ready = part({ id: 1, authored_role: "Narrator" })
    const skipped = part({ id: 2, position: 1, authored_role: "Guide", enabled: false })
    render(<WorkstationOutline parts={[ready, skipped]} selectedId={null} directory={directory} onSelect={vi.fn()} onCollapse={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Skipped" }))
    expect(screen.queryByRole("button", { name: /01.*Narrator/ })).toBeNull()
    expect(screen.getByRole("button", { name: /02.*Guide.*Skipped/ })).toBeTruthy()
  })

  it("projects actual Production timing into distinct sound tracks", () => {
    const parts = [
      part({ id: 1, authored_role: "Narrator", duration_ms: 8_000 }),
      part({ id: 2, position: 1, kind: "silence", title: "1.5", duration_ms: 1_500, clip_id: null }),
      part({ id: 3, position: 2, kind: "asset", title: "Door closes", duration_ms: 2_000, clip_id: 30 }),
    ]
    render(<TimelineWorkspace session={sessionFor(scene(parts))} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.getByText("Narrator")).toBeTruthy()
    expect(screen.getByText("Door closes")).toBeTruthy()
    expect(screen.getByText("Music")).toBeTruthy()
    expect(screen.getByText("Quiet room")).toBeTruthy()
    expect(screen.getByText("2 audio · 1 pause")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pause Part 02 · 1.5 seconds" }).className).toContain("sound-sequence-silence")
    expect(screen.getByRole("button", { name: "Undo audio edit" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Redo audio edit" })).toBeTruthy()
  })

  it("opens the new Audio Track flow without altering an existing track first", () => {
    const onAddAudio = vi.fn()
    render(<TimelineWorkspace session={sessionFor(scene([part({ duration_ms: 30_000 })]))} onAddAudio={onAddAudio} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Add to Timeline" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Audio from Library" }))

    expect(onAddAudio).toHaveBeenCalledOnce()
    expect(onAddAudio).toHaveBeenCalledWith({ mode: "new-track" })
  })

  it("uses the full Timeline when no visual media is placed and reveals the Viewer after a placement exists", () => {
    const emptyVisual: VisualScene = {
      production_id: 6,
      revision: 1,
      updated_at: "2026-08-27",
      document: { version: 1, canvas: { width: 1920, height: 1080 }, tracks: [{ id: "image", name: "Image", media_type: "image", visible: true, locked: false, clips: [] }] },
    }
    const props = { session: sessionFor(scene([part({ duration_ms: 30_000 })])), assets: [], onAddVisual: vi.fn(), onRemoveClip: vi.fn(), onRemoveTrack: vi.fn() }
    const { unmount } = render(<TimelineWorkspace session={props.session} visual={{ ...props, session: visualSessionFor(emptyVisual) }} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.queryByLabelText("Production viewer")).toBeNull()
    expect(screen.getByRole("button", { name: "Add image to Image track" })).toBeTruthy()
    unmount()

    const placedVisual: VisualScene = { ...emptyVisual, document: { ...emptyVisual.document, tracks: [{ ...emptyVisual.document.tracks[0]!, clips: [{ id: "placement", asset_id: 91, start_ms: 0, duration_ms: 5_000, source_offset_ms: 0, fit: "cover", position_x: 0, position_y: 0, scale: 1, opacity: 1, locked: false }] }] } }
    render(<TimelineWorkspace session={sessionFor(scene([part({ duration_ms: 30_000 })]))} visual={{ ...props, session: visualSessionFor(placedVisual) }} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.getByLabelText("Production viewer")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Hide Viewer" }))
    expect(screen.getByLabelText("Production viewer").className).toContain("is-collapsed")
    fireEvent.click(screen.getByRole("button", { name: "Show Viewer" }))
    expect(screen.getByRole("button", { name: "Add visual at playhead" })).toBeTruthy()
  })

  it("keeps a muted track level editable for the value that applies on unmute", () => {
    const soundScene = scene([part({ id: 1, authored_role: "Narrator", duration_ms: 8_000 })])
    const musicTrack = soundScene.document.tracks[0]
    if (!musicTrack) throw new Error("Expected Music track fixture")
    musicTrack.muted = true
    render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.getByRole("slider", { name: "Music gain" }).getAttribute("aria-disabled")).not.toBe("true")
    expect(screen.getByRole("button", { name: "Unmute Music" })).toBeTruthy()
  })

  it("keeps essential track mixing available in the compact rail", () => {
    const onRemoveTrack = vi.fn()
    render(<TimelineWorkspace session={sessionFor(scene([part({ duration_ms: 30_000 })]))} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={onRemoveTrack} />)

    fireEvent.click(screen.getByRole("button", { name: "Hide track controls" }))

    expect(screen.getByRole("button", { name: "Adjust Music gain" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Track actions for Music" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Add audio clip to Music" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Adjust Music gain" }))
    expect(screen.getByRole("slider", { name: "Music gain" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mute track" })).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })
    fireEvent.pointerDown(screen.getByRole("button", { name: "Track actions for Music" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove “Music”" }))
    expect(onRemoveTrack).toHaveBeenCalledWith(expect.objectContaining({ id: "music", name: "Music" }))
  })

  it("presents linked audio as a reusable Venture asset instead of empty speech", () => {
    const replaceAsset = vi.fn()
    const source = part({ id: 4, position: 3, kind: "asset", title: "Temple door stinger", text: "Temple door stinger", filename: "door.wav", duration_ms: 2_400, clip_id: 40, asset_collection: "Stingers", cost: 0 })
    render(<WorkstationAssetCard part={source} index={3} selected={false} playing={false} actions={partActions({ replaceAsset })} />)

    expect(screen.getByText("Temple door stinger")).toBeTruthy()
    expect(screen.getByText("Stingers · Venture source")).toBeTruthy()
    expect(screen.getByText("0:02.4")).toBeTruthy()
    expect(screen.getByText("Free · reusable")).toBeTruthy()
    expect(screen.queryByText("Unknown Voice")).toBeNull()
    expect(screen.queryByText("Recording method not chosen")).toBeNull()
    expect(screen.queryByText("No captions")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Replace source" }))
    expect(replaceAsset).toHaveBeenCalledWith(source)
  })

  it("sizes the timeline from Production time instead of the raw music source", () => {
    const story = part({ duration_ms: 120_000 })
    const soundScene = scene([story], 1_500_000)
    soundScene.document.tracks[0]!.clips[0]!.asset_name = "Long source"
    soundScene.resolved.tracks[0]!.clips[0]!.asset_name = "Long source"
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect((container.querySelector(".sound-scene-timeline") as HTMLElement).style.width).toBe("1200px")
  })

  it("persists one document after a committed drag, never one update per frame", async () => {
    const soundScene = scene([part({ duration_ms: 120_000 })], 1_500_000)
    const onCommit = vi.fn().mockResolvedValue({ ...soundScene, revision: 2 })
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene, onCommit)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const musicClip = container.querySelector(".sound-music-clip") as HTMLElement
    fireEvent.pointerDown(musicClip, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 120 })
    fireEvent.pointerMove(window, { clientX: 135 })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { clientX: 135 })
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
  })

  it("keeps a stable contextual toolbar while shift-selecting several clips", () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const second = { ...soundScene.document.tracks[0]!.clips[0]!, id: "88af885c-aeb4-49bf-9edb-d3fc14496b2c", asset_name: "Rain layer", anchor: { kind: "absolute" as const, position_ms: 20_000 }, resolved_start_ms: 20_000 }
    soundScene.document.tracks[0]!.clips.push(second)
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const clips = container.querySelectorAll(".sound-music-clip")

    fireEvent.pointerDown(clips[0]!, { button: 0, clientX: 100 })
    fireEvent.pointerDown(clips[1]!, { button: 0, clientX: 200, shiftKey: true })

    expect(screen.getByText("Audio selection")).toBeTruthy()
    expect(screen.getAllByText("2 clips").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Effects/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Duplicate selected clips" })).toBeTruthy()
  })

  it("prevents an invalid split without covering the Timeline controls", () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const session = sessionFor(soundScene)
    const { container } = render(<TimelineWorkspace session={session} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const clip = container.querySelector(".sound-music-clip") as HTMLElement

    fireEvent.pointerDown(clip, { button: 0, clientX: 100 })
    fireEvent.pointerUp(window, { clientX: 100 })

    expect(screen.getByRole("button", { name: "Split at playhead" }).hasAttribute("disabled")).toBe(true)

    fireEvent.keyDown(window, { key: "s" })
    const feedback = screen.getByRole("alert")
    expect(feedback.textContent).toContain("Place the playhead inside a selected clip")
    expect(feedback.closest(".sound-scene-context-bar")).toBeTruthy()

    act(() => session.seek(1))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "Split at playhead" }).hasAttribute("disabled")).toBe(false)
  })

  it("shows durable lock and effect states directly on a Music clip", () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const source = soundScene.document.tracks[0]!.clips[0]!
    source.locked = true
    source.effects = [{ id: "2bc326ca-57ba-4e63-bdfd-6145dfb73181", type: "telephone", enabled: true }]

    render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.getByTitle("Locked")).toBeTruthy()
    expect(screen.getByTitle("1 active effect")).toBeTruthy()
  })

  it("treats a partly locked multi-selection as locked instead of enabling destructive actions", () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const second = { ...soundScene.document.tracks[0]!.clips[0]!, id: "88af885c-aeb4-49bf-9edb-d3fc14496b2c", locked: true, anchor: { kind: "absolute" as const, position_ms: 20_000 }, resolved_start_ms: 20_000 }
    soundScene.document.tracks[0]!.clips.push(second)
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const clips = container.querySelectorAll(".sound-music-clip")

    fireEvent.pointerDown(clips[0]!, { button: 0, clientX: 100 })
    fireEvent.pointerUp(window, { clientX: 100 })
    fireEvent.pointerDown(clips[1]!, { button: 0, clientX: 200, shiftKey: true })
    fireEvent.pointerUp(window, { clientX: 200, shiftKey: true })

    expect(screen.getByRole("button", { name: "Lock all" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Duplicate selected clips" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Delete selected clips" }).hasAttribute("disabled")).toBe(true)
  })

  it("pans the viewport by dragging unused timeline space", () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const scroll = container.querySelector(".sound-scene-scroll") as HTMLElement
    const lane = container.querySelector(".sound-scene-lane.is-music") as HTMLElement
    scroll.scrollLeft = 100

    fireEvent.pointerDown(lane, { button: 0, clientX: 500 })
    fireEvent.pointerMove(window, { clientX: 400 })
    fireEvent.pointerUp(window, { clientX: 400 })

    expect(scroll.scrollLeft).toBe(200)
  })

  it("moves an existing multi-selection together and persists one document", async () => {
    const soundScene = scene([part({ duration_ms: 120_000 })])
    const second = {
      ...soundScene.document.tracks[0]!.clips[0]!,
      id: "88af885c-aeb4-49bf-9edb-d3fc14496b2c",
      asset_name: "Rain layer",
      anchor: { kind: "absolute" as const, position_ms: 20_000 },
      resolved_start_ms: 20_000,
    }
    soundScene.document.tracks[0]!.clips.push(second)
    const onCommit = vi.fn().mockImplementation(async (document) => ({
      ...soundScene, revision: 2, document,
    }))
    const { container } = render(<TimelineWorkspace session={sessionFor(soundScene, onCommit)} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const clips = container.querySelectorAll(".sound-music-clip")
    fireEvent.pointerDown(clips[0]!, { button: 0, clientX: 100 })
    fireEvent.pointerUp(window, { clientX: 100 })
    fireEvent.pointerDown(clips[1]!, { button: 0, clientX: 200, shiftKey: true })
    fireEvent.pointerUp(window, { clientX: 200, shiftKey: true })

    fireEvent.pointerDown(clips[0]!, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 150, altKey: true })
    fireEvent.pointerUp(window, { clientX: 150, altKey: true })

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    const document = onCommit.mock.calls[0]![0]
    expect(document.tracks[0].clips.map((clip: { anchor: { position_ms: number } }) => clip.anchor.position_ms)).toEqual([5_000, 25_000])
  })

  it("cancels a timeline gesture without persisting when Escape is pressed", async () => {
    const soundScene = scene([part({ duration_ms: 120_000 })], 1_500_000)
    const onCommit = vi.fn().mockResolvedValue({ ...soundScene, revision: 2 })
    const session = sessionFor(soundScene, onCommit)
    const initialAnchor = session.currentClip("music", musicClipId)?.anchor
    const { container } = render(<TimelineWorkspace session={session} onAddAudio={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const musicClip = container.querySelector(".sound-music-clip") as HTMLElement

    fireEvent.pointerDown(musicClip, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 160 })
    fireEvent.keyDown(window, { key: "Escape" })
    await Promise.resolve()

    expect(onCommit).not.toHaveBeenCalled()
    expect(session.currentClip("music", musicClipId)?.anchor).toEqual(initialAnchor)
  })

  it("keeps exact positioning available after the legacy Production is removed", () => {
    const moveToPosition = vi.fn()
    const source = part({ id: 8 })
    render(<WorkstationSequenceCard part={source} index={0} selected={false} playing={false} liveJobs={{}} directory={directory} actions={partActions({ moveToPosition })} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Part actions" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to position…" }))

    expect(moveToPosition).toHaveBeenCalledWith(source)
  })

  it("offers every canonical Sequence Part type at the exact insertion point", () => {
    const addBefore = vi.fn()
    const first = part({ id: 8, position: 0 })
    const second = part({ id: 9, position: 1 })
    render(<WorkstationSequence parts={[first, second]} selectedId={null} playerPlaying={false} liveJobs={{}} directory={directory} actions={partActions({ addBefore })} onAddEnd={vi.fn()} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Add a Part before Part 2" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Pause" }))

    expect(addBefore).toHaveBeenCalledWith(second, "silence")
  })

  it("reorders a Part from its real drag handle using the canonical reorder action", () => {
    const reorderToPosition = vi.fn()
    const parts = [part({ id: 8, position: 0 }), part({ id: 9, position: 1 }), part({ id: 10, position: 2 })]
    const { container } = render(<WorkstationSequence parts={parts} selectedId={null} playerPlaying={false} liveJobs={{}} directory={directory} actions={partActions({ reorderToPosition })} onAddEnd={vi.fn()} />)
    const transfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() }

    fireEvent.dragStart(screen.getByRole("button", { name: "Drag Part 01 to reorder" }), { dataTransfer: transfer })
    fireEvent.dragOver(container.querySelectorAll(".ws-sequence-slot")[2]!, { dataTransfer: transfer, clientY: 300 })
    fireEvent.drop(container.querySelectorAll(".ws-sequence-slot")[2]!, { dataTransfer: transfer })

    expect(reorderToPosition).toHaveBeenCalledWith(parts[0], 2)
  })

  it("keeps durable failed-generation recovery in the canonical Workstation", () => {
    const retry = vi.fn()
    const job = { id: "speech-failed", type: "speech", status: "failed", progress: 0, detail: "Provider request failed", retries: 0, result: {}, request: { text: "A clear story opening." } as GeneratePayload } as DurableJob<GenerateResult> & { request: GeneratePayload }
    const source = part({ id: 9, kind: "draft", clip_id: null, speech_job: job })
    render(<WorkstationSequenceCard part={source} index={0} selected={false} playing={false} liveJobs={{}} directory={directory} actions={partActions({ retry })} />)

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(retry).toHaveBeenCalledWith(source, job)
  })
})
