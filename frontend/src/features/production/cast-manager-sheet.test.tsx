// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CastManagerContent } from "./cast-manager-sheet"

describe("CastManagerContent", () => {
  it("states future-only recast truth and pairs color with a named role", () => {
    render(<CastManagerContent
      production={{ public_id: "production", trail: [] } as never}
      cast={[{ id: "role", name: "Narrator", color: "#2563eb", position: 0, persona_id: null, persona_name: null, voice_source_kind: "identity", voice_identity_id: "voice", catalogue_voice_id: null, assignment_revision: 1, part_count: 4 }]}
      directory={{ identities: [{ id: "voice", name: "Samira", metadata: {}, routes: [], usage: {} }], cloned: [], meta: {}, catalog: [], config: null } as never}
      onChanged={vi.fn()}
    />)
    expect(screen.getByText("Recast is future-only")).toBeTruthy()
    expect(screen.getByText("Future recordings use the new voice. Existing Takes remain unchanged.")).toBeTruthy()
    expect(screen.getByText("Narrator")).toBeTruthy()
    expect(screen.getByText(/4 Parts/)).toBeTruthy()
    expect(screen.getAllByRole("button", { name: /Use role color/ }).length).toBeGreaterThan(1)
  })
})
