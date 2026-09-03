import { describe, expect, it } from "vitest"

import fileCardSource from "./file-card.tsx?raw"
import filePresentationSource from "./file-presentation.ts?raw"
import filePreviewSource from "./file-preview-dialog.tsx?raw"
import fileUploadSource from "./file-upload-dialog.tsx?raw"

describe("shared File presentation boundary", () => {
  it("does not contain Production-type-specific semantics", () => {
    const sharedFileSource = [
      fileCardSource,
      filePresentationSource,
      filePreviewSource,
      fileUploadSource,
    ].join("\n")

    expect(sharedFileSource).not.toMatch(/\b(?:Timeline|Audiovisual|Canvas|Slides|Merch)\b/i)
  })
})
