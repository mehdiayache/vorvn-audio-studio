// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DurableJob, GeneratePayload, GenerateResult, MusicBed, ProductionPart, VoiceDirectory } from "@/types/domain"
import { InlineProductionName } from "./production-workstation-page"
import { WorkstationOutline, WorkstationSequenceCard, workstationPartState, type WorkstationPartActions } from "./workstation-sequence"
import { WorkstationSoundDesign } from "./workstation-sound-design"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock

const directory = { config: null, cloned: [], meta: {}, catalog: [] } as VoiceDirectory

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
    select: vi.fn(), edit: vi.fn(), play: vi.fn(), captions: vi.fn(), duplicate: vi.fn(), remove: vi.fn(),
    move: vi.fn(), moveToPosition: vi.fn(), retry: vi.fn(), confirm: vi.fn(), setEnabled: vi.fn(),
    editSilence: vi.fn(), addBefore: vi.fn(), ...values,
  }
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
    const music: MusicBed = { filename: "bed.mp3", name: "Quiet room", volume: .12, duck: true, duration_ms: 60_000 }
    render(<WorkstationSoundDesign parts={parts} music={music} selection={null} onSelection={vi.fn()} onAddSound={vi.fn()} />)

    expect(screen.getByRole("generic", { name: "Voice track" }).textContent).toContain("Narrator")
    expect(screen.getByRole("generic", { name: "Sound effects track" }).textContent).toContain("Door closes")
    expect(screen.getByRole("generic", { name: "Music track" }).textContent).toContain("Quiet room")
  })

  it("sizes the timeline from Production time instead of the raw music source", () => {
    const story = part({ duration_ms: 120_000 })
    const music: MusicBed = { filename: "long-source.mp3", name: "Long source", volume: .12, duck: true, duration_ms: 1_500_000 }
    const { container } = render(<WorkstationSoundDesign parts={[story]} music={music} selection={null} onSelection={vi.fn()} onAddSound={vi.fn()} />)

    expect((container.querySelector(".ws-timeline") as HTMLElement).style.width).toBe("1200px")
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
