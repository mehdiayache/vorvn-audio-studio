// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { ProductionHeader } from "@/components/production-header"
import type { Production } from "@/types/domain"

describe("ProductionHeader", () => {
  it("keeps the exact Health count in the Focus Bar", () => {
    const production = { name: "Conversation", status: "draft", parts: [], trail: [], total_cost: 0 } as unknown as Production
    render(<MemoryRouter><ProductionHeader production={production} duration={0} mixExportOpen={false} productionPlaying={false} issueCount={43} onExplorer={vi.fn()} onCommands={vi.fn()} onHealth={vi.fn()} onPreview={vi.fn()} onAdd={vi.fn()} onRelease={vi.fn()} onDelete={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole("button", { name: "43 Production issues" })).toBeTruthy()
    expect(screen.getByText("43")).toBeTruthy()
  })
})
