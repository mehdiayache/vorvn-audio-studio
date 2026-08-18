// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DurableJob, GeneratePayload, GenerateResult, ProductionPart, SoundScene, VoiceDirectory } from "@/types/domain"
import { InlineProductionName } from "./production-workstation-page"
import { WorkstationAssetCard, WorkstationOutline, WorkstationSequenceCard, workstationPartState, type WorkstationPartActions } from "./workstation-sequence"
import { SoundSceneWorkspace } from "@/features/sound-scene/timeline/sound-scene-workspace"
import { SoundSceneSession } from "@/features/sound-scene/engine/sound-scene-session"

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
    move: vi.fn(), moveToPosition: vi.fn(), retry: vi.fn(), confirm: vi.fn(), setEnabled: vi.fn(),
    editSilence: vi.fn(), addBefore: vi.fn(), ...values,
  }
}

function scene(parts: ProductionPart[], sourceDurationMs = 60_000): SoundScene {
  let cursor = 0
  const spans = parts.map((item) => {
    const duration = Number(item.duration_ms || 0)
    const span = { part_id: item.id, part_public_id: String(item.id), position: item.position, kind: item.kind, title: item.title || "", role: item.authored_role || "", voice_name: item.voice_name || "", filename: item.filename || "", start_ms: cursor, duration_ms: duration, silence: item.kind === "silence", missing: false }
    cursor += duration
    return span
  })
  const clip = { id: musicClipId, asset_id: 9, start_ms: 0, duration_ms: null, source_offset_ms: 0, gain: .12, fade_in_ms: 2_000, fade_out_ms: 4_000, loop: true, ducking: true, anchor: { kind: "absolute" as const, position_ms: 0 }, asset_name: "Quiet room", filename: "bed.mp3", source_duration_ms: sourceDurationMs, resolved_start_ms: 0, resolved_duration_ms: cursor }
  const track = { id: "music", kind: "music" as const, name: "Music", volume: 1, muted: false, clips: [clip] }
  return { production_id: 6, revision: 1, document: { version: 1, tracks: [track] }, can_undo: false, can_redo: false, updated_at: "2026-08-18", resolved: { version: 1, signature: "scene", duration_ms: cursor, sequence_projection: { signature: "sequence", duration_ms: cursor, sample_rate: 48_000, spans }, tracks: [track], orphans: [] }, sequence_stem: { url: "/audio/sequence-stem.mp3", filename: "sequence-stem.mp3", duration_ms: cursor, signature: "sequence", cached: true } }
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

  it("projects actual Production timing into distinct sound tracks", () => {
    const parts = [
      part({ id: 1, authored_role: "Narrator", duration_ms: 8_000 }),
      part({ id: 2, position: 1, kind: "silence", title: "1.5", duration_ms: 1_500, clip_id: null }),
      part({ id: 3, position: 2, kind: "asset", title: "Door closes", duration_ms: 2_000, clip_id: 30 }),
    ]
    render(<SoundSceneWorkspace session={sessionFor(scene(parts))} onAddMusic={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect(screen.getByText("Narrator")).toBeTruthy()
    expect(screen.getByText("Door closes")).toBeTruthy()
    expect(screen.getByText("Quiet room")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Silence 1.5 seconds" }).className).toContain("sound-sequence-silence")
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
    const { container } = render(<SoundSceneWorkspace session={sessionFor(soundScene)} onAddMusic={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)

    expect((container.querySelector(".sound-scene-timeline") as HTMLElement).style.width).toBe("1200px")
  })

  it("persists one document after a committed drag, never one update per frame", async () => {
    const soundScene = scene([part({ duration_ms: 120_000 })], 1_500_000)
    const onCommit = vi.fn().mockResolvedValue({ ...soundScene, revision: 2 })
    const { container } = render(<SoundSceneWorkspace session={sessionFor(soundScene, onCommit)} onAddMusic={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const musicClip = container.querySelector(".sound-music-clip") as HTMLElement
    fireEvent.pointerDown(musicClip, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 120 })
    fireEvent.pointerMove(window, { clientX: 135 })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { clientX: 135 })
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
  })

  it("cancels a timeline gesture without persisting when Escape is pressed", async () => {
    const soundScene = scene([part({ duration_ms: 120_000 })], 1_500_000)
    const onCommit = vi.fn().mockResolvedValue({ ...soundScene, revision: 2 })
    const session = sessionFor(soundScene, onCommit)
    const initialStart = session.currentClip("music", musicClipId)?.start_ms
    const { container } = render(<SoundSceneWorkspace session={session} onAddMusic={vi.fn()} onRemoveClip={vi.fn()} onRemoveTrack={vi.fn()} />)
    const musicClip = container.querySelector(".sound-music-clip") as HTMLElement

    fireEvent.pointerDown(musicClip, { button: 0, clientX: 100 })
    fireEvent.pointerMove(window, { clientX: 160 })
    fireEvent.keyDown(window, { key: "Escape" })
    await Promise.resolve()

    expect(onCommit).not.toHaveBeenCalled()
    expect(session.currentClip("music", musicClipId)?.start_ms).toBe(initialStart)
  })

  it("keeps exact positioning available after the legacy Production is removed", () => {
    const moveToPosition = vi.fn()
    const source = part({ id: 8 })
    render(<WorkstationSequenceCard part={source} index={0} selected={false} playing={false} liveJobs={{}} directory={directory} actions={partActions({ moveToPosition })} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Part actions" }), { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to position…" }))

    expect(moveToPosition).toHaveBeenCalledWith(source)
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
