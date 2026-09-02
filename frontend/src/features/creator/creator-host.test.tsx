// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CreatorHost } from "./creator-host"

afterEach(cleanup)

describe("CreatorHost", () => {
  it("switches Image and Speech through the same capability-neutral host", () => {
    render(<CreatorHost context={{ workspace_id: 4 }} initialCapability="speech">
      {({ capability, context, renderWorkspace }) => renderWorkspace({
        creatorDetail: capability,
        creator: <div data-testid="active-capability" data-output={String(context.selection?.output_media_type || "")}>{capability}</div>,
        library: <div>Shared Library</div>,
      })}
    </CreatorHost>)

    expect(screen.getByTestId("active-capability").textContent).toBe("speech")
    expect(screen.getByText("Shared Library")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Image" }))

    expect(screen.getByTestId("active-capability").textContent).toBe("image")
    expect(screen.getByTestId("active-capability").getAttribute("data-output")).toBe("image")
  })

  it("resets to the requested capability when a launcher changes route", () => {
    const view = render(<CreatorHost context={{ workspace_id: 4 }} initialCapability="speech">
      {({ capability, renderWorkspace }) => renderWorkspace({ creator: <div data-testid="route-capability">{capability}</div>, library: null })}
    </CreatorHost>)

    fireEvent.click(screen.getByRole("button", { name: "Music" }))
    expect(screen.getByTestId("route-capability").textContent).toBe("music")

    view.rerender(<CreatorHost context={{ workspace_id: 4 }} initialCapability="video">
      {({ capability, renderWorkspace }) => renderWorkspace({ creator: <div data-testid="route-capability">{capability}</div>, library: null })}
    </CreatorHost>)
    expect(screen.getByTestId("route-capability").textContent).toBe("video")
  })
})
