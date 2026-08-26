// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DirectorStage } from "../director/director-stage"
import { WORKSTATION_STAGES } from "../workstation-workflow"

describe("Production workflow", () => {
  it("presents the four accepted operator stages in order", () => {
    expect(WORKSTATION_STAGES.map(({ id, label, description }) => ({ id, label, description }))).toEqual([
      { id: "sequence", label: "Script", description: "Voice and story" },
      { id: "director", label: "Director", description: "Create and collect visuals" },
      { id: "sound", label: "Timeline", description: "Assemble the production" },
      { id: "mix", label: "Export", description: "Finish and deliver" },
    ])
  })

  it("keeps Director truthful before visual tools are enabled", () => {
    render(<DirectorStage />)

    expect(screen.getByRole("heading", { name: "Create and collect visual material" })).toBeTruthy()
    expect(screen.getByText(/These tools are not enabled yet/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
